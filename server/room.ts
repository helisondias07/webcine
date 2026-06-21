import config from "./config.ts";
import axios from "axios";
import { Server, Socket } from "socket.io";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { redis, redisCount, redisCountDistinct } from "./utils/redis.ts";
import { type AssignedVM } from "./vm/base.ts";
import { getStartOfDay } from "./utils/time.ts";
import { postgres, updateObject, upsertObject } from "./utils/postgres.ts";
import {
  fetchYoutubeVideo,
  getYoutubeVideoID,
  isYouTube,
} from "./utils/youtube.ts";
//@ts-expect-error
import twitch from "twitch-m3u8";
import { type QueryResult } from "pg";
import { Docker } from "./vm/docker.ts";

const PASSWORD_HASH_PREFIX = "scrypt$";
const ROOM_PASSWORD_ATTEMPT_WINDOW_SECONDS = 10 * 60;
const ROOM_PASSWORD_MAX_ATTEMPTS = 12;
const roomPasswordAttempts = new Map<
  string,
  { count: number; expiresAt: number }
>();

// Stateless pool instance to use for VMs if full management isn't needed
let stateless: Docker | undefined = undefined;
if (!config.VM_MANAGER_CONFIG) {
  stateless = new Docker({
    provider: "Docker",
    isLarge: false,
    region: "US",
    limitSize: 0,
    minSize: 0,
    hostname: config.DOCKER_VM_HOST,
  });
}

// Extend the interface
declare module "socket.io" {
  interface Socket {
    clientId: string;
    uid: string;
  }
}

export class Room {
  // Serialized state
  public video: string | null = "";
  public videoTS = 0;
  public playbackRate = 1;
  public paused = false;
  public loop = false;
  private chat: ChatMessage[] = [];
  private nameMap: StringDict = {};
  private nameColorMap: StringDict = {};
  private pictureMap: StringDict = {};
  public vBrowser: AssignedVM | undefined = undefined;
  public creator: string | undefined = undefined; // email of the user who created the room (just used for stats)
  public lock: string | undefined = undefined; // uid of the user who locked the room
  public playlist: PlaylistVideo[] = [];

  // Non-serialized state
  public roomId: string;
  public roster: User[] = [];
  private lastTsMap = Date.now();
  private tsMap: NumberDict = {};
  private io: Server;
  private socketIdMap: StringDict = {};
  private tsInterval: NodeJS.Timeout | undefined = undefined;
  private countdownStartTimeout: NodeJS.Timeout | undefined = undefined;
  public isChatDisabled: boolean | undefined = undefined;
  public lastUpdateTime: Date = new Date();
  public dirty = true;
  private preventTSUpdate = false;
  // Not really a queue since there's no ordering, we just retry as long as this is set
  // If we want a real queue then we need external processing of the jobs and a way to update the room from outside
  public vBrowserQueue:
    | {
        roomId: string;
        queueTime: Date;
        isLarge: boolean;
        region: string;
        uid: string;
        clientId: string;
      }
    | undefined = undefined;

  constructor(
    io: Server,
    roomId: string,
    roomData?: string | null | undefined,
  ) {
    this.roomId = roomId;
    this.io = io;

    if (roomData) {
      this.deserialize(roomData);
    }

    if (this.tsInterval) {
      clearInterval(this.tsInterval);
    }
    this.tsInterval = setInterval(async () => {
      // console.log(roomId, this.video, this.roster, this.tsMap, this.nameMap);
      // Clean up the data of users who aren't in the room anymore
      const memberIds = this.roster.map((p) => p.id);
      Object.keys(this.tsMap).forEach((key) => {
        if (!memberIds.includes(key)) {
          delete this.tsMap[key];
        }
      });
      if (this.video && !this.paused && this.roster.length > 1) {
        this.lastTsMap = Date.now();
        io.of(roomId).emit("REC:tsMap", this.tsMap);
      }
    }, 2000);

    io.of(roomId).use(async (socket, next) => {
      const clientId = socket.handshake.query?.clientId;
      if (typeof clientId !== "string") {
        next(new Error("Tipo de clientId invalido"));
        return;
      }
      // validate clientId is UUID, prevents prototype pollution
      if (!isValidUUID(clientId)) {
        next(new Error("Formato de clientId invalido"));
        return;
      }
      if (postgres) {
        const attemptKey = getRoomPasswordAttemptKey(
          this.roomId,
          socket,
          clientId,
        );
        const attempts = await getRoomPasswordAttempts(attemptKey);
        if (attempts >= ROOM_PASSWORD_MAX_ATTEMPTS) {
          next(
            new Error(
              "Muitas tentativas de senha. Aguarde alguns minutos para tentar novamente.",
            ),
          );
          return;
        }
        const result = await postgres.query(
          `SELECT password, owner FROM room where "roomId" = $1`,
          [this.roomId],
        );
        const authPassword = socket.handshake.auth?.password;
        const legacyPassword = socket.handshake.query?.password;
        const password =
          typeof authPassword === "string"
            ? authPassword
            : typeof legacyPassword === "string"
              ? legacyPassword
              : "";
        // Check if user has the password
        const roomPassword = result.rows[0]?.password;
        const roomOwner = result.rows[0]?.owner;
        if (roomPassword) {
          const hasPasswordMatch = verifyRoomPassword(password, roomPassword);
          const isRoomOwner = Boolean(
            roomOwner && clientId === String(roomOwner),
          );
          if (!hasPasswordMatch && !isRoomOwner) {
            await incrementRoomPasswordAttempts(attemptKey);
            next(new Error("password"));
            return;
          }
          await clearRoomPasswordAttempts(attemptKey);
          // Transparently upgrade legacy plaintext passwords to scrypt hash.
          if (hasPasswordMatch && !isPasswordHash(roomPassword) && password) {
            try {
              await updateObject(
                postgres,
                "room",
                { password: hashRoomPassword(password) },
                { roomId: this.roomId },
              );
            } catch (e) {
              console.warn("[password upgrade failed]", e);
            }
          }
        }
        // Check if room is at capacity
        const roomCapacity = Number(config.ROOM_CAPACITY) || 0;
        if (roomCapacity > 0 && this.roster.length >= roomCapacity) {
          next(new Error("Esta sala atingiu o limite de participantes."));
          return;
        }
      } else {
        const roomCapacity = Number(config.ROOM_CAPACITY) || 0;
        if (roomCapacity > 0 && this.roster.length >= roomCapacity) {
          next(new Error("Esta sala atingiu o limite de participantes."));
          return;
        }
      }
      // clientId is the persistent local browser identity used for room
      // ownership, controls, chat and screenshare signaling.

      // redis-based clientId spoof protection (session)
      // Keep a map of clientIds to sessionIDs (a secret generated by client and stored in localstorage)
      // If a clientId already exists in map, a matching sessionId must be provided, otherwise fail
      // Otherwise, store it with some expiry
      // Refresh the expiry on each successful connection
      // Attacker can't spoof unless the user doesn't connect for a long time

      // ALTERNATIVE: using crypto?
      // What if we send back the client an encrypt or hmac of their clientID?
      // Client can store in localstorage
      // Can't be spoofed without the server's encryption key
      // Attacker could try to bruteforce the key by trying all possibilities
      // Client sends both the clear clientId and the hmac
      // During transition, accept requests with no hmac
      // We would need to turn on enforcement after a while (after all clients have updated)
      // On connection, compute hmac of clear clientId and verify it matches what client sent
      // We can accept query param clientHmac?

      const sessionId = socket.handshake.auth.sessionId;
      // If Redis isn't enabled we'll just allow
      if (redis) {
        const key = "session:" + clientId;
        const savedSession = await redis.get(key);
        if (savedSession) {
          // passed ID must match, otherwise error
          if (savedSession !== sessionId) {
            next(new Error("SessionId incorreto"));
            return;
          } else {
            // Refresh expiry
            await redis.expire(key, 60 * 24 * 7);
          }
        } else {
          // Create new session
          if (sessionId) {
            await redis.setex(key, 60 * 24 * 7, sessionId);
          }
        }
      }

      const isExistingMember = this.roster.some(
        (member) => member.id === clientId,
      );
      if (this.lock && !isExistingMember) {
        next(new Error("Sala trancada. Novas entradas estao bloqueadas."));
        return;
      }

      // Replace an existing connection for this client before registering the
      // new socket, so reconnects cannot leave duplicate roster entries.
      const previousSocketId = this.socketIdMap[clientId];
      if (previousSocketId) {
        this.clearEphemeralShare(clientId);
        io.of(roomId).sockets.get(previousSocketId)?.disconnect(true);
      }
      this.roster = this.roster.filter((member) => member.id !== clientId);
      // Keep track of the current socketID associated with this client (only used for signaling and kicking)
      this.socketIdMap[clientId] = socket.id;
      this.roster.push({ id: clientId });

      next();
    });
    io.of(roomId).on("connection", async (socket: Socket) => {
      const clientId = socket.handshake.query?.clientId;
      if (typeof clientId !== "string") {
        // We already validated in middleware above, this is just to satisfy TS
        return;
      }

      redisCount("connectStarts");
      redisCountDistinct("connectStartsDistinct", clientId);

      socket.emit("REC:host", this.getHostState());
      socket.emit("REC:nameMap", this.nameMap);
      socket.emit("REC:nameColorMap", this.nameColorMap);
      socket.emit("REC:pictureMap", this.pictureMap);
      socket.emit("REC:tsMap", this.tsMap);
      socket.emit("REC:lock", this.lock);
      socket.emit("chatinit", this.chat);
      socket.emit("playlist", this.playlist);
      this.getRoomState(socket);
      io.of(roomId).emit("roster", this.getRosterForApp());

      socket.clientId = clientId;
      socket.uid = clientId;
      // Check if this socket matches this.lock UID
      const validateLock = () => {
        return !this.lock || socket.uid === this.lock;
      };

      // Check if this socket matches the room owner UID
      const validateOwner = async () => {
        const result = await postgres?.query(
          'SELECT owner FROM room where "roomId" = $1',
          [this.roomId],
        );
        const owner = result?.rows[0]?.owner;
        if (owner && !isValidUUID(String(owner))) {
          await updateObject(
            postgres!,
            "room",
            { owner: null },
            { roomId: this.roomId },
          );
          return true;
        }
        return !owner || socket.uid === owner;
      };

      let joinAnnouncementSent = false;
      socket.on("CMD:name", (data: unknown) => {
        this.changeUserName(socket, String(data));
        if (!joinAnnouncementSent && String(data ?? "").trim()) {
          joinAnnouncementSent = true;
          this.addChatMessage(socket, {
            id: socket.clientId,
            cmd: "userJoined",
            msg: "",
          });
        }
      });
      socket.on("CMD:nameColor", (data: unknown) =>
        this.changeUserNameColor(socket, data),
      );
      socket.on("CMD:picture", (data: unknown) =>
        this.changeUserPicture(socket, String(data)),
      );
      socket.on("CMD:host", (data: unknown) => {
        validateLock() && this.startHosting(socket, String(data));
      });
      socket.on("CMD:play", () => {
        validateLock() && this.playVideo(socket);
      });
      socket.on("CMD:pause", () => {
        validateLock() && this.pauseVideo(socket);
      });
      socket.on("CMD:seek", (data: unknown) => {
        validateLock() && this.seekVideo(socket, Number(data));
      });
      socket.on("CMD:playbackRate", (data: unknown) => {
        validateLock() && this.setPlaybackRate(socket, Number(data));
      });
      socket.on("CMD:startCountdown", () => {
        validateLock() && this.startCountdown(socket);
      });
      socket.on("CMD:loop", (data: unknown) => {
        validateLock() && this.setLoop(Boolean(data));
      });
      socket.on("CMD:ts", (data: unknown) =>
        this.setTimestamp(socket, Number(data)),
      );
      socket.on("CMD:chat", (data: unknown) =>
        this.sendChatMessage(socket, String(data)),
      );
      socket.on("CMD:typing", (data: unknown) =>
        this.broadcastTyping(socket, data),
      );
      socket.on("CMD:joinScreenShare", (data) => {
        validateLock() && this.joinScreenSharing(socket, data);
      });
      socket.on("CMD:setScreenShareQuality", (data: unknown) =>
        this.setScreenShareQualityPreference(socket, data),
      );
      socket.on("CMD:leaveScreenShare", () => this.leaveScreenSharing(socket));
      socket.on("CMD:changeController", (data: unknown) => {
        validateLock() && this.changeController(String(data));
      });
      socket.on("CMD:lock", async (data: unknown) => {
        try {
          const hasLock = validateLock();
          const isOwner = await validateOwner();
          (hasLock || isOwner) && this.lockRoom(socket, data);
        } catch (e) {
          console.error("[CMD:lock] Erro:", e);
        }
      });
      socket.on("CMD:askHost", () => {
        socket.emit("REC:host", this.getHostState());
      });
      socket.on("CMD:getRoomState", () => this.getRoomState(socket));
      socket.on("CMD:setRoomState", async (data: unknown) => {
        try {
          if (await validateOwner()) {
            await this.setRoomState(socket, data);
          } else {
            socket.emit(
              "errorMessage",
              "Apenas o dono da sala pode alterar essas configuracoes.",
            );
          }
        } catch (e) {
          console.error("[CMD:setRoomState] Erro:", e);
        }
      });
      socket.on("CMD:setRoomOwner", async (data: unknown) => {
        try {
          (await validateOwner()) && this.setRoomOwner(socket, data);
        } catch (e) {
          console.error("[CMD:setRoomOwner] Erro:", e);
        }
      });
      socket.on("CMD:playlistNext", (data: unknown) => {
        validateLock() && this.playlistNext(data);
      });
      socket.on("CMD:playlistAdd", (data: unknown) => {
        validateLock() && this.playlistAdd(socket, String(data));
      });
      socket.on("CMD:playlistMove", (data: unknown) => {
        validateLock() && this.playlistMove(data);
      });
      socket.on("CMD:playlistDelete", (data: unknown) => {
        validateLock() && this.playlistDelete(Number(data));
      });
      socket.on("CMD:kickUser", async (data: unknown) => {
        try {
          (await validateOwner()) && this.kickUser(data);
        } catch (e) {
          console.error("[CMD:kickUser] Erro:", e);
        }
      });
      socket.on("CMD:deleteChatMessages", async (data: unknown) => {
        try {
          (await validateOwner()) && this.deleteChatMessages(data);
        } catch (e) {
          console.error("[CMD:deleteChatMessages] Erro:", e);
        }
      });

      socket.on("signalSS", (data: unknown) =>
        this.sendSignal(socket, data, "signalSS"),
      );

      socket.on("disconnect", () => this.onDisconnect(socket));
    });
  }

  public serialize = () => {
    // Get the set of IDs with messages in chat
    // Only serialize roster and picture ID for those people, to save space
    const chatIDs = new Set(this.chat.map((msg) => msg.id));
    const abbrNameMap: StringDict = {};
    Object.keys(this.nameMap).forEach((id) => {
      if (chatIDs.has(id)) {
        abbrNameMap[id] = this.nameMap[id];
      }
    });
    const abbrPictureMap: StringDict = {};
    Object.keys(this.pictureMap).forEach((id) => {
      if (chatIDs.has(id)) {
        abbrPictureMap[id] = this.pictureMap[id];
      }
    });
    const abbrNameColorMap: StringDict = {};
    Object.keys(this.nameColorMap).forEach((id) => {
      if (chatIDs.has(id)) {
        abbrNameColorMap[id] = this.nameColorMap[id];
      }
    });
    return JSON.stringify({
      video: this.isEphemeralShare() ? "" : this.video,
      videoTS: this.videoTS,
      playbackRate: this.playbackRate,
      paused: this.paused,
      chat: this.chat,
      nameMap: abbrNameMap,
      nameColorMap: abbrNameColorMap,
      pictureMap: abbrPictureMap,
      vBrowser: this.vBrowser,
      lock: this.lock,
      creator: this.creator,
      playlist: this.playlist,
      loop: this.loop,
    });
  };

  private deserialize = (roomData: string) => {
    let roomObj: any;
    try {
      roomObj = JSON.parse(roomData);
    } catch (e) {
      console.error("[deserialize] Falha ao parsear roomData:", e);
      return;
    }
    this.video =
      typeof roomObj.video === "string" &&
      !roomObj.video.startsWith("screenshare://") &&
      !roomObj.video.startsWith("fileshare://")
        ? roomObj.video
        : "";
    this.videoTS = roomObj.videoTS;
    if (roomObj.paused) {
      this.paused = roomObj.paused;
    }
    if (roomObj.chat) {
      this.chat = roomObj.chat;
    }
    if (roomObj.nameMap) {
      this.nameMap = roomObj.nameMap;
    }
    if (roomObj.nameColorMap) {
      this.nameColorMap = roomObj.nameColorMap;
    }
    if (roomObj.pictureMap) {
      this.pictureMap = roomObj.pictureMap;
    }
    if (roomObj.vBrowser) {
      this.vBrowser = roomObj.vBrowser;
    }
    if (roomObj.lock) {
      this.lock = roomObj.lock;
    }
    if (roomObj.creator) {
      this.creator = roomObj.creator;
    }
    if (roomObj.playlist) {
      this.playlist = roomObj.playlist;
    }
    if (roomObj.playbackRate) {
      this.playbackRate = roomObj.playbackRate;
    }
    if (roomObj.loop) {
      this.loop = roomObj.loop;
    }
  };

  public saveRoom = async () => {
    if (postgres && this.dirty) {
      try {
        const roomString = this.serialize();
        await postgres.query(
          `UPDATE room SET
          "lastUpdateTime" = $1, data = $2
          WHERE "roomId" = $3`,
          [this.lastUpdateTime ?? new Date(), roomString, this.roomId],
        );
        this.dirty = false;
      } catch (e) {
        console.warn(e);
      }
    }
  };

  public destroy = () => {
    if (this.tsInterval) {
      clearInterval(this.tsInterval);
    }
    if (this.countdownStartTimeout) {
      clearTimeout(this.countdownStartTimeout);
      this.countdownStartTimeout = undefined;
    }
  };

  public getRosterForStats = () => {
    return this.roster.map((p) => ({
      id: p.id,
      name: this.nameMap[p.id] || p.id,
      ts: this.tsMap[p.id],
      // TODO this will not work behind nginx reverse proxy, pass it and read from X-Real-IP instead
      // socket.handshake.headers["x-real-ip"]
      // ip: this.io.of(this.roomId).sockets.get(p.id)?.request?.socket
      //   ?.remoteAddress,
    }));
  };

  protected getSharerId = (): string => {
    let sharerId = "";
    if (this.video?.startsWith("screenshare://")) {
      sharerId = this.video?.slice("screenshare://".length).split("@")[0];
    } else if (this.video?.startsWith("fileshare://")) {
      sharerId = this.video?.slice("fileshare://".length).split("@")[0];
    }
    return sharerId;
  };

  protected getRosterForApp = (): User[] => {
    return this.roster.map((p) => {
      return {
        ...p,
        isScreenShare: p.id === this.getSharerId(),
      };
    });
  };

  private getHostState = (): HostState => {
    return {
      video: this.video ?? "",
      videoTS: this.videoTS,
      playbackRate: this.playbackRate,
      paused: this.paused,
      isVBrowserLarge: Boolean(this.vBrowser && this.vBrowser.large),
      controller: this.vBrowser?.controllerClient,
      loop: this.loop,
    };
  };

  private isEphemeralShare = (clientId?: string) => {
    const video = String(this.video ?? "");
    if (
      !video.startsWith("screenshare://") &&
      !video.startsWith("fileshare://")
    ) {
      return false;
    }
    if (!clientId) {
      return true;
    }
    const ownerId = video
      .replace(/^screenshare:\/\//, "")
      .replace(/^fileshare:\/\//, "")
      .split("@")[0];
    return ownerId === clientId;
  };

  private clearEphemeralShare = (clientId: string) => {
    if (!this.isEphemeralShare(clientId)) {
      return;
    }
    this.video = "";
    this.videoTS = 0;
    this.paused = true;
    this.tsMap = {};
    this.dirty = true;
    this.io.of(this.roomId).emit("REC:tsMap", this.tsMap);
    this.io.of(this.roomId).emit("REC:host", this.getHostState());
  };

  public stopVBrowserInternal = async () => {
    const assignTime = this.vBrowser && this.vBrowser.assignTime;
    const id = this.vBrowser?.id;
    const provider = this.vBrowser?.provider;
    const isLarge = this.vBrowser?.large ?? false;
    const region = this.vBrowser?.region ?? "";
    const uid = this.vBrowser?.creatorUID ?? "";
    this.vBrowser = undefined;
    this.cmdHost(null, "");
    // Force a save because this might change in unattended rooms
    this.lastUpdateTime = new Date();
    this.saveRoom();
    if (redis && assignTime) {
      await redis.lpush("vBrowserSessionMS", Date.now() - assignTime);
      await redis.ltrim("vBrowserSessionMS", 0, 19);
    }

    if (id) {
      try {
        if (stateless) {
          await stateless.terminateVM(id);
        } else {
          await axios.post(
            "http://localhost:" + config.VMWORKER_PORT + "/releaseVM",
            {
              provider,
              isLarge,
              region,
              id,
              roomId: this.roomId,
            },
          );
        }
      } catch (e) {
        console.warn(e);
      }
    }
  };

  private cmdHost = (socket: Socket | null, data: string) => {
    if (data && data.length > 50000) {
      return;
    }
    this.video = data;
    this.videoTS = 0;
    this.paused = false;
    this.loop = false;
    this.playbackRate = 1;
    this.tsMap = {};
    this.preventTSUpdate = true;
    this.dirty = true;
    setTimeout(() => (this.preventTSUpdate = false), 1000);
    this.io.of(this.roomId).emit("REC:tsMap", this.tsMap);
    this.io.of(this.roomId).emit("REC:host", this.getHostState());
    if (data === "") {
      this.playlistNext(null);
    }
    // The room video is changing so remove room from vbrowser queue
    this.vBrowserQueue = undefined;
    // Resend the roster (updates screenshare state etc)
    this.io.of(this.roomId).emit("roster", this.getRosterForApp());
  };

  public addChatMessage = (socket: Socket | null, chatMsg: ChatMessageBase) => {
    if (this.isChatDisabled && !chatMsg.cmd) {
      return;
    }
    const chatWithTime: ChatMessage = {
      ...chatMsg,
      timestamp: new Date().toISOString(),
      videoTS: socket?.clientId ? this.tsMap[socket.clientId] : undefined,
    };
    this.chat.push(chatWithTime);
    this.chat = this.chat.slice(-100);
    this.dirty = true;
    this.io.of(this.roomId).emit("REC:chat", chatWithTime);
  };

  private changeUserName = (socket: Socket, data: string) => {
    if (!data) {
      return;
    }
    if (data && data.length > 50) {
      return;
    }
    this.nameMap[socket.clientId] = data;
    this.io.of(this.roomId).emit("REC:nameMap", this.nameMap);
  };

  private changeUserNameColor = (socket: Socket, raw: unknown) => {
    const data = raw as { value?: string } | string;
    const value =
      typeof data === "string"
        ? data
        : typeof data?.value === "string"
          ? data.value
          : "";
    if (!/^#([0-9a-f]{6})$/i.test(value)) {
      return;
    }
    this.nameColorMap[socket.clientId] = value.toUpperCase();
    this.io.of(this.roomId).emit("REC:nameColorMap", this.nameColorMap);
  };

  private changeUserPicture = (socket: Socket, data: string) => {
    if (data && data.length > 10000) {
      return;
    }
    this.pictureMap[socket.clientId] = data;
    this.io.of(this.roomId).emit("REC:pictureMap", this.pictureMap);
  };

  private startHosting = async (socket: Socket, data: string) => {
    if (this.vBrowser) {
      socket.emit(
        "errorMessage",
        `Can't update the video while vbrowser is running`,
      );
      return;
    }
    redisCount("urlStarts");
    if (config.STREAM_PATH && data?.startsWith(config.STREAM_PATH)) {
      redisCount("streamStarts");
    }
    if (config.CONVERT_PATH && data?.startsWith(config.CONVERT_PATH)) {
      redisCount("convertStarts");
    }
    // If a reddit URL, extract video URL
    if (
      data?.startsWith("https://www.reddit.com") ||
      data?.startsWith("https://old.reddit.com") ||
      data?.startsWith("https://reddit.com")
    ) {
      if (data.endsWith("/")) {
        // Remove trailing slash
        data = data.slice(0, -1);
      }
      data = data + ".json";
      // Extract fallback_url
      let json: any;
      try {
        const resp = await axios.get(data);
        json = resp.data;
      } catch (e) {
        console.warn("[cmdHost] Reddit fetch failed", e);
        socket?.emit(
          "errorMessage",
          "Não foi possível carregar este link do Reddit.",
        );
        return;
      }
      let reddit_m3u8 =
        json?.[0]?.data?.children?.[0]?.data?.secure_media?.reddit_video
          ?.hls_url;
      let reddit_mp4 =
        json?.[0]?.data?.children?.[0]?.data?.secure_media?.reddit_video
          ?.fallback_url;
      // prefer reddit m3u8 streams over the mp4 links as the m3u8 streams contain audio.
      data = reddit_m3u8 || reddit_mp4 || data;
    } else if (
      data?.startsWith("https://www.twitch.tv") ||
      data?.startsWith("https://twitch.tv")
    ) {
      try {
        if (!config.TWITCH_PROXY_PATH) {
          socket.emit(
            "errorMessage",
            "Links da Twitch nao estao habilitados neste ambiente.",
          );
          return;
        }
        // Extract m3u8 data
        // Note this won't work directly since Twitch will reject requests from the wrong origin--need to proxy the m3u8 playlist
        const channel = data.split("/").slice(-1)[0];
        const isStream = isNaN(Number(channel));
        let streams = [];
        if (isStream) {
          streams = await twitch.getStream(channel);
        } else {
          streams = await twitch.getVod(channel);
        }
        // console.log(streams);
        const target =
          streams.find((str: any) => str.quality.includes("(source)")) ||
          streams[0];
        const parsed = new URL(target?.url);
        const newUrl = new URL(config.TWITCH_PROXY_PATH);
        newUrl.pathname = "/proxy" + parsed.pathname;
        newUrl.searchParams.set("host", parsed.host);
        newUrl.searchParams.set("displayName", data);
        newUrl.search = newUrl.searchParams.toString();
        data = newUrl.toString();
      } catch (e) {
        console.warn(e);
        socket.emit(
          "errorMessage",
          "Nao foi possivel abrir esta live da Twitch.",
        );
        return;
      }
    }
    this.cmdHost(socket, data);
  };

  private playlistNext = (raw: unknown) => {
    const data = raw ? String(raw) : null;
    // Clients may pass the URL that should be the current one.
    // If we've already advanced the playlist, we can ignore duplicate calls
    if (
      data &&
      this.video &&
      data !== this.video &&
      getYoutubeVideoID(data) !== getYoutubeVideoID(this.video)
    ) {
      // Validation didn't match
      return;
    }
    const next = this.playlist.shift();
    this.io.of(this.roomId).emit("playlist", this.playlist);
    if (next) {
      this.cmdHost(null, next.url);
    }
  };

  public playlistAdd = async (socket: Socket | null, data: string) => {
    if (data && data.length > 20000) {
      return;
    }
    redisCount("playlistAdds");
    const youtubeVideoId = getYoutubeVideoID(data);
    let fallbackName = "Midia externa";
    let fallbackChannel = "Link direto";
    if (youtubeVideoId) {
      fallbackName = "Video do YouTube";
      fallbackChannel = "YouTube";
    } else {
      try {
        const parsed = new URL(data);
        const host = parsed.hostname.replace(/^www\./, "");
        fallbackChannel = host || fallbackChannel;
        const pathLeaf = decodeURIComponent(
          parsed.pathname.split("/").filter(Boolean).slice(-1)[0] || "",
        );
        if (host.includes("twitch.tv")) {
          fallbackName = pathLeaf
            ? `Live da Twitch: ${pathLeaf}`
            : "Live da Twitch";
          fallbackChannel = "Twitch";
        } else if (pathLeaf) {
          fallbackName = pathLeaf;
        } else if (host) {
          fallbackName = host;
        }
      } catch {
        fallbackName = data;
      }
    }
    const item = {
      name: fallbackName,
      channel: fallbackChannel,
      duration: 0,
      url: data,
      type: data.startsWith("magnet:") ? "magnet" : "file",
    };
    let video: PlaylistVideo | null = null;
    try {
      if (youtubeVideoId) {
        video = await fetchYoutubeVideo(youtubeVideoId);
      }
    } catch (e) {
      // Failed to fetch YouTube video info but can still add the URL
      console.warn(e);
    }
    if (video) {
      this.playlist.push(video);
    } else {
      this.playlist.push(item);
    }
    this.dirty = true;
    this.io.of(this.roomId).emit("playlist", this.playlist);
  };

  private playlistDelete = (index: number) => {
    if (index !== -1) {
      this.playlist.splice(index, 1);
      this.dirty = true;
      this.io.of(this.roomId).emit("playlist", this.playlist);
    }
  };

  private playlistMove = (raw: unknown) => {
    const data = raw as { index: number; toIndex: number };
    if (!data) {
      return;
    }
    if (data.index !== -1) {
      const items = this.playlist.splice(data.index, 1);
      this.playlist.splice(data.toIndex, 0, items[0]);
      this.dirty = true;
      this.io.of(this.roomId).emit("playlist", this.playlist);
    }
  };

  private playVideo = (socket: Socket) => {
    socket.broadcast.emit("REC:play", this.video);
    this.paused = false;
    this.dirty = true;
  };

  private pauseVideo = (socket: Socket) => {
    socket.broadcast.emit("REC:pause");
    this.paused = true;
    this.dirty = true;
  };

  private seekVideo = (socket: Socket, data: number) => {
    if (String(data).length > 100) {
      return;
    }
    this.videoTS = data;
    this.dirty = true;
    socket.broadcast.emit("REC:seek", data);
  };

  private setPlaybackRate = (socket: Socket, data: number) => {
    if (String(data).length > 100) {
      return;
    }
    this.playbackRate = Number(data);
    this.dirty = true;
    this.io.of(this.roomId).emit("REC:playbackRate", Number(data));
  };

  private setLoop = (data: boolean) => {
    if (String(data).length > 100) {
      return;
    }
    this.loop = data;
    this.io.of(this.roomId).emit("REC:loop", data);
  };

  private setTimestamp = (socket: Socket, data: number) => {
    if (String(data).length > 100) {
      return;
    }
    // Prevent lagging TS updates from the old video from messing up our timestamps
    if (this.preventTSUpdate) {
      return;
    }
    // This is negative for live streams, so allow overwriting
    // Otherwise, only increment this value to prevent a lagging viewer from holding up the room state
    if (data < 0 || data > this.videoTS) {
      this.videoTS = data;
    }
    // Normalize the received TS based on how long since the last tsMap emit
    // Later sends will have higher values so subtract the difference
    // Add 1 as we will emit 1 second from the last one
    const timeSinceTsMap = Date.now() - this.lastTsMap;
    // console.log(socket.clientId, 'offset', offset, 'ms');
    this.tsMap[socket.clientId] = data - timeSinceTsMap / 1000 + 1;
  };

  private sendChatMessage = (socket: Socket, data: string) => {
    if (data && data.length > 10000) {
      return;
    }
    redisCount("chatMessages");
    const chatMsg = { id: socket.clientId, msg: data };
    this.addChatMessage(socket, chatMsg);
  };

  private startCountdown = (socket: Socket) => {
    if (!this.video) {
      socket.emit(
        "errorMessage",
        "Nenhum vídeo ativo para iniciar a contagem regressiva.",
      );
      return;
    }
    const startAt = Date.now() + 200;
    this.io.of(this.roomId).emit("REC:startCountdown", {
      startedBy: socket.clientId,
      startAt,
      seconds: 3,
    });
    this.addChatMessage(socket, {
      id: socket.clientId,
      cmd: "countdownStarted",
      msg: `🎬 ${(this.nameMap[socket.clientId] || "Host").slice(0, 40)} iniciou uma contagem regressiva!`,
      system: true,
    });
    if (this.countdownStartTimeout) {
      clearTimeout(this.countdownStartTimeout);
    }
    this.countdownStartTimeout = setTimeout(() => {
      this.paused = false;
      this.io.of(this.roomId).emit("REC:play");
      this.countdownStartTimeout = undefined;
    }, 3200);
  };

  private broadcastTyping = (socket: Socket, raw: unknown) => {
    const data = raw as { isTyping?: boolean };
    if (!data?.isTyping) {
      return;
    }
    socket.broadcast.emit("REC:typing", {
      user: socket.clientId,
      timestamp: new Date().toISOString(),
    });
  };

  private setScreenShareQualityPreference = (socket: Socket, raw: unknown) => {
    const data = raw as { mode?: string };
    const mode = String(data?.mode ?? "");
    if (!["economy", "auto", "high"].includes(mode)) {
      return;
    }
    const sharer = this.getRosterForApp().find((user) => user.isScreenShare);
    if (!sharer || sharer.id === socket.clientId) {
      return;
    }
    const sharerSocketId = this.socketIdMap[sharer.id];
    if (!sharerSocketId) {
      return;
    }
    this.io
      .of(this.roomId)
      .to(sharerSocketId)
      .emit("REC:setViewerShareQuality", {
        viewerId: socket.clientId,
        mode,
      });
  };

  private joinScreenSharing = (socket: Socket, raw: unknown) => {
    const data = raw as { file: boolean; mediasoup?: boolean };
    if (!data) {
      return;
    }
    const sharer = this.getRosterForApp().find((user) => user.isScreenShare);
    if (sharer) {
      // Someone's already sharing
      socket.emit(
        "errorMessage",
        "Ja existe um compartilhamento ativo nesta sala",
      );
      return;
    }
    const mediasoupServer = String(config.MEDIASOUP_SERVER ?? "").trim();
    const mediasoupSuffix = mediasoupServer ? `@${mediasoupServer}` : "";
    if (data && data.file) {
      this.cmdHost(socket, "fileshare://" + socket.clientId + mediasoupSuffix);
      redisCount("fileShareStarts");
    } else {
      this.cmdHost(
        socket,
        "screenshare://" + socket.clientId + mediasoupSuffix,
      );
      redisCount("screenShareStarts");
      this.addChatMessage(socket, {
        id: socket.clientId,
        cmd: "shareStarted",
        msg: "",
      });
    }
    this.io.of(this.roomId).emit("roster", this.getRosterForApp());
  };

  private leaveScreenSharing = (socket: Socket) => {
    const sharer = this.getRosterForApp().find((user) => user.isScreenShare);
    if (!sharer || sharer?.id !== socket.clientId) {
      socket.emit(
        "errorMessage",
        "Voce nao e o usuario que esta compartilhando",
      );
      return;
    }
    this.cmdHost(socket, "");
    this.io.of(this.roomId).emit("roster", this.getRosterForApp());
  };

  private changeController = (data: string) => {
    if (data && data.length > 100) {
      return;
    }
    if (this.vBrowser) {
      this.vBrowser.controllerClient = data;
      this.io.of(this.roomId).emit("REC:changeController", data);
    }
  };

  private lockRoom = async (socket: Socket, raw: unknown) => {
    const data = raw as { locked: boolean };
    if (!data) {
      return;
    }
    const { uid } = socket;
    this.lock = data.locked ? uid : "";
    this.io.of(this.roomId).emit("REC:lock", this.lock);
  };

  private setRoomOwner = async (socket: Socket, raw: unknown) => {
    const data = raw as {
      undo: boolean;
    };
    if (!data) {
      return;
    }
    if (!postgres) {
      socket.emit("errorMessage", "Banco de dados indisponivel");
      return;
    }
    const { uid } = socket;
    if (data.undo) {
      await updateObject(
        postgres,
        "room",
        {
          password: null,
          owner: null,
          vanity: null,
          isChatDisabled: null,
          roomTitle: null,
          roomDescription: null,
          roomTitleColor: null,
          mediaPath: null,
        },
        { roomId: this.roomId },
      );
      socket.emit("REC:getRoomState", {});
    } else {
      const roomObj = {
        roomId: this.roomId,
        owner: uid,
      };
      let result: QueryResult | null = null;
      result = await upsertObject(postgres, "room", roomObj, {
        roomId: true,
      });
      const row = result?.rows?.[0];
      // console.log(result, row);
      socket.emit("REC:getRoomState", {
        hasPassword: Boolean(row?.password),
        vanity: row?.vanity,
        owner: row?.owner,
      });
    }
  };

  private getRoomState = async (socket: Socket) => {
    if (!postgres) {
      return;
    }
    const result = await postgres.query(
      `SELECT password, vanity, owner, "isChatDisabled", "roomTitle", "roomDescription", "roomTitleColor", "mediaPath" FROM room where "roomId" = $1`,
      [this.roomId],
    );
    const first = result.rows[0];
    if (first?.owner && !isValidUUID(String(first.owner))) {
      await updateObject(
        postgres,
        "room",
        { owner: null },
        { roomId: this.roomId },
      );
      first.owner = null;
    }
    if (this.isChatDisabled === undefined) {
      this.isChatDisabled = Boolean(first?.isChatDisabled);
    }
    const isOwner = Boolean(
      first?.owner && socket.uid && socket.uid === first.owner,
    );
    socket.emit("REC:getRoomState", {
      hasPassword: isOwner ? Boolean(first?.password) : undefined,
      vanity: first?.vanity,
      owner: first?.owner,
      isChatDisabled: first?.isChatDisabled,
      roomTitle: first?.roomTitle,
      roomDescription: first?.roomDescription,
      roomTitleColor: first?.roomTitleColor,
      mediaPath: first?.mediaPath,
    });
  };

  private setRoomState = async (socket: Socket, raw: unknown) => {
    const data = raw as {
      password?: string;
      vanity: string;
      isChatDisabled: boolean;
      roomTitle: string;
      roomDescription: string;
      roomTitleColor: string;
      mediaPath: string;
    };
    if (!postgres) {
      socket.emit("errorMessage", "Banco de dados indisponivel");
      return;
    }
    if (!data) {
      return;
    }
    const {
      vanity,
      isChatDisabled,
      roomTitle,
      roomDescription,
      roomTitleColor,
      mediaPath,
    } = data;
    const normalizedRoomTitleColor =
      typeof roomTitleColor === "string" && roomTitleColor
        ? roomTitleColor
        : "#888888";
    const hasPasswordUpdate = Object.prototype.hasOwnProperty.call(
      data,
      "password",
    );
    const password =
      typeof data.password === "string" ? data.password.trim() : "";
    if (hasPasswordUpdate && password.length > 100) {
      socket.emit("errorMessage", "Senha muito longa");
      return;
    }
    if (vanity && vanity.length > 100) {
      socket.emit("errorMessage", "URL personalizada muito longa");
      return;
    }
    if (roomTitle && roomTitle.length > 50) {
      socket.emit("errorMessage", "Titulo da sala muito longo");
      return;
    }
    if (roomDescription && roomDescription.length > 120) {
      socket.emit("errorMessage", "Descricao da sala muito longa");
      return;
    }
    // check if is valid hex color representation
    if (!/^#([0-9a-f]{3}){1,2}$/i.test(normalizedRoomTitleColor)) {
      socket.emit("errorMessage", "Codigo de cor invalido");
      return;
    }
    if (mediaPath && mediaPath.length > 1000) {
      socket.emit("errorMessage", "Fonte de midia muito longa");
      return;
    }
    // console.log(owner, vanity, password);
    const roomObj: any = {
      roomId: this.roomId,
      isChatDisabled: isChatDisabled,
      mediaPath: mediaPath,
    };
    if (hasPasswordUpdate) {
      roomObj.password = password ? hashRoomPassword(password) : null;
    }
    const { uid } = socket;
    roomObj.roomTitle = roomTitle;
    roomObj.roomTitleColor = normalizedRoomTitleColor;
    roomObj.vanity = vanity || null;
    roomObj.roomDescription = roomDescription;
    try {
      const query = `UPDATE room
        SET ${Object.keys(roomObj).map((k, i) => `"${k}" = $${i + 1}`)}
        WHERE "roomId" = $${Object.keys(roomObj).length + 1}
        AND owner = $${Object.keys(roomObj).length + 2}
        RETURNING *`;
      const result = await postgres.query(query, [
        ...Object.values(roomObj),
        this.roomId,
        uid,
      ]);
      const row = result.rows[0];
      if (!row) {
        socket.emit(
          "errorMessage",
          "Apenas o dono da sala pode alterar essas configuracoes.",
        );
        return;
      }
      this.isChatDisabled = Boolean(row?.isChatDisabled);
      const roomStatePayload = {
        hasPassword: Boolean(row?.password),
        vanity: row?.vanity,
        owner: row?.owner,
        isChatDisabled: row?.isChatDisabled,
        roomTitle: row?.roomTitle,
        roomDescription: row?.roomDescription,
        roomTitleColor: row?.roomTitleColor,
        mediaPath: row?.mediaPath,
      };
      this.io.of(this.roomId).emit("REC:getRoomState", {
        ...roomStatePayload,
      });
      socket.emit("REC:getRoomState", {
        ...roomStatePayload,
      });
      socket.emit("successMessage", "Configuracoes salvas");
    } catch (e) {
      console.warn(e);
    }
  };

  private sendSignal = (
    socket: Socket,
    raw: unknown,
    eventName: "signalSS",
  ) => {
    const data = raw as { to: string; msg: string; sharer?: boolean };
    if (!data) {
      return;
    }
    const fromClientId = socket.clientId;
    const toId = this.socketIdMap[data.to];
    if (toId) {
      this.io.of(this.roomId).to(toId).emit(eventName, {
        from: fromClientId,
        msg: data.msg,
        sharer: data.sharer,
      });
    }
  };

  private onDisconnect = (socket: Socket) => {
    const { clientId } = socket;
    // Disconnecting socket is the current one
    if (socket.id === this.socketIdMap[clientId]) {
      this.clearEphemeralShare(clientId);
      let index = this.roster.findIndex((user) => user.id === clientId);
      if (index > -1) {
        this.roster.splice(index, 1);
      }
      this.io.of(this.roomId).emit("roster", this.getRosterForApp());
      delete this.tsMap[clientId];
      delete this.socketIdMap[clientId];
      // Cleanup nameMap/pictureMap for users with no chat messages to avoid unbounded growth
      const hasMessages = this.chat.some((msg) => msg.id === clientId);
      if (!hasMessages) {
        delete this.nameMap[clientId];
        delete this.pictureMap[clientId];
      }
    }
  };

  private kickUser = async (raw: unknown) => {
    const data = raw as { userToBeKicked: string };
    if (!data || !data.userToBeKicked) {
      return;
    }
    const socketId = this.socketIdMap[data.userToBeKicked];
    if (!socketId) {
      return;
    }
    const userToBeKickedSocket = this.io.of(this.roomId).sockets.get(socketId);
    if (userToBeKickedSocket) {
      userToBeKickedSocket.emit("kicked");
      userToBeKickedSocket.disconnect();
    }
  };

  private deleteChatMessages = async (raw: unknown) => {
    const data = raw as {
      author: string;
      timestamp: string | undefined;
    };
    if (!data) {
      return;
    }
    if (!data.timestamp && !data.author) {
      this.chat.length = 0;
    } else {
      this.chat = this.chat.filter((msg) => {
        if (data.timestamp) {
          return msg.id !== data.author || msg.timestamp !== data.timestamp;
        }
        return msg.id !== data.author;
      });
    }
    this.io.of(this.roomId).emit("chatinit", this.chat);
    return;
  };
}

function isPasswordHash(value: string) {
  return value.startsWith(PASSWORD_HASH_PREFIX);
}

function hashRoomPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${PASSWORD_HASH_PREFIX}${salt}$${digest}`;
}

function verifyRoomPassword(password: string, stored: string) {
  if (!stored) {
    return false;
  }
  if (!isPasswordHash(stored)) {
    return password === stored;
  }
  const parts = stored.split("$");
  const salt = parts[1] ?? "";
  const digest = parts[2] ?? "";
  if (!salt || !digest) {
    return false;
  }
  const expected = Buffer.from(digest, "hex");
  const derived = Buffer.from(
    scryptSync(password, salt, 64).toString("hex"),
    "hex",
  );
  if (expected.length !== derived.length) {
    return false;
  }
  return timingSafeEqual(expected, derived);
}

function getRoomPasswordAttemptKey(
  roomId: string,
  socket: Socket,
  clientId: string,
) {
  const forwardedFor = socket.handshake.headers["x-forwarded-for"];
  const realIp = socket.handshake.headers["x-real-ip"];
  const ipRaw =
    typeof forwardedFor === "string"
      ? forwardedFor.split(",")[0]
      : typeof realIp === "string"
        ? realIp
        : socket.handshake.address;
  const ip = String(ipRaw ?? "").trim() || "unknown";
  return `${roomId}:${ip}:${clientId}`;
}

async function getRoomPasswordAttempts(key: string) {
  const redisKey = `roomPwdFail:${key}`;
  if (redis) {
    const val = await redis.get(redisKey);
    return Number(val ?? 0);
  }
  const now = Date.now();
  const existing = roomPasswordAttempts.get(key);
  if (!existing || existing.expiresAt <= now) {
    roomPasswordAttempts.delete(key);
    return 0;
  }
  return existing.count;
}

async function incrementRoomPasswordAttempts(key: string) {
  const redisKey = `roomPwdFail:${key}`;
  if (redis) {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, ROOM_PASSWORD_ATTEMPT_WINDOW_SECONDS);
    }
    return count;
  }
  const now = Date.now();
  const existing = roomPasswordAttempts.get(key);
  if (!existing || existing.expiresAt <= now) {
    roomPasswordAttempts.set(key, {
      count: 1,
      expiresAt: now + ROOM_PASSWORD_ATTEMPT_WINDOW_SECONDS * 1000,
    });
    return 1;
  }
  existing.count += 1;
  roomPasswordAttempts.set(key, existing);
  return existing.count;
}

async function clearRoomPasswordAttempts(key: string) {
  const redisKey = `roomPwdFail:${key}`;
  if (redis) {
    await redis.del(redisKey);
    return;
  }
  roomPasswordAttempts.delete(key);
}

function isValidUUID(id: string) {
  return /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i.test(
    id,
  );
}
