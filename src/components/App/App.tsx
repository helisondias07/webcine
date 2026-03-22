import type MediasoupClient from "mediasoup-client";
import React from "react";
import { Alert, Loader, Menu, Modal, Overlay, Title } from "@mantine/core";
import io, { Socket } from "socket.io-client";
import {
  formatSpeed,
  iceServers,
  isMobile,
  serverPath,
  testAutoplay,
  openFileSelector,
  getOrCreateClientId,
  getOrCreateSessionId,
  calculateMedian,
  getUserImage,
  isYouTube,
  isMagnet,
  isHttp,
  isHls,
  isScreenShare,
  isFileShare,
  isVBrowser,
  isDash,
  VIDEO_MAX_HEIGHT_CSS,
  createUuid,
  getSavedPasswords,
} from "../../utils/utils";
import { Chat } from "../Chat/Chat";
import { TopBar } from "../TopBar/TopBar";
import { VBrowser } from "../VBrowser/VBrowser";
import { VideoChat } from "../VideoChat/VideoChat";
import { getCurrentSettings } from "../Settings/LocalSettings";
import { MultiStreamModal } from "../Modal/MultiStreamModal";
import { ComboBox } from "../ComboBox/ComboBox";
import { Controls } from "../Controls/Controls";
import { VBrowserModal } from "../Modal/VBrowserModal";
import { SettingsModal } from "../Settings/SettingsModal";
import { ErrorModal } from "../Modal/ErrorModal";
import { PasswordModal } from "../Modal/PasswordModal";
import { ScreenShareModal } from "../Modal/ScreenShareModal";
import { FileShareModal } from "../Modal/FileShareModal";
import { SurpriseModal } from "../Modal/SurpriseModal";
import firebase from "firebase/compat/app";
import { HTML } from "./HTML";
import { YouTube } from "./YouTube";
import styles from "./App.module.css";
import config from "../../config";
import { MetadataContext } from "../../MetadataContext";
import ChatVideoCard from "../ChatVideoCard/ChatVideoCard";
import { ActionIcon, Badge, Button, TextInput } from "@mantine/core";
import {
  IconFile,
  IconList,
  IconMessageCircle,
  IconMoodSmile,
  IconScreenShare,
  IconSettings,
  IconUser,
  IconUsersGroup,
  IconVolume,
  IconX,
} from "@tabler/icons-react";
import { InviteButton } from "../InviteButton/InviteButton";
import { t } from "../../i18n";
import type WebTorrent from "webtorrent";
import type Hls from "hls.js";
import { type MediaPlayerClass } from "dashjs";
import { type Torrent } from "webtorrent";

declare global {
  interface Window {
    onYouTubeIframeAPIReady: any;
    YT: YT.JsApi;
    watchparty: {
      ourStream: MediaStream | undefined;
      videoRefs: HTMLVideoElementDict;
      videoPCs: PCDict;
      socket?: Socket;
      webtorrent?: WebTorrent.Instance;
      hls?: Hls;
      dash?: MediaPlayerClass;
    };
  }
}

window.watchparty = {
  ourStream: undefined,
  videoRefs: {},
  videoPCs: {},
  socket: undefined,
};

const clientId = getOrCreateClientId();
const DEFAULT_CHAT_NAME = "Convidado";
const YOUTUBE_QUALITY_STORAGE_KEY = "watchparty-yt-quality";
const SEARCH_HINT_STORAGE_KEY = "watchparty-search-hint-seen";
const NAME_COLOR_STORAGE_KEY = "watchparty-name-color";
const DEFAULT_NAME_COLOR = "#FFFFFF";
const VBROWSER_ENABLED = false;
const LIVE_REACTION_EMOJIS = [
  "\u{1F602}",
  "\u{1F525}",
  "\u{1F631}",
  "\u{1F44F}",
  "\u{1F60D}",
  "\u{1F480}",
] as const;
const PRESET_NAME_COLORS = [
  "#FFFFFF",
  "#FFE100",
  "#FF8C00",
  "#FF2E2E",
  "#FF1493",
  "#D66BFF",
  "#8A2BE2",
  "#23D5FF",
  "#0047FF",
  "#39FF14",
  "#0B6B2A",
  "#D4A017",
] as const;

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

type YouTubeQualityMode = "auto" | YT.SuggestedVideoQuality;

function normalizeYouTubeQuality(value: unknown): YouTubeQualityMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  switch (normalized) {
    case "auto":
      return "auto";
    case "default":
      return "default";
    case "small":
      return "small";
    case "medium":
      return "medium";
    case "large":
      return "large";
    case "hd720":
      return "hd720";
    case "hd1080":
      return "hd1080";
    case "highres":
      return "highres";
    default:
      return "hd1080";
  }
}

interface AppProps {
  vanity?: string;
  urlRoomId?: string;
}

interface AppState {
  state: "starting" | "connected";
  roomMedia: string;
  roomPaused: boolean;
  roomLoop: boolean;
  participants: User[];
  rosterUpdateTS: Number;
  chat: ChatMessage[];
  playlist: PlaylistVideo[];
  tsMap: NumberDict;
  nameMap: StringDict;
  pictureMap: StringDict;
  nameColorMap: StringDict;
  myName: string;
  myNameColor: string;
  myPicture: string;
  loading: boolean;
  scrollTimestamp: number;
  unreadCount: number;
  fullScreen: boolean;
  controlsTimestamp: number;
  watchOptions: SearchResult[];
  isVBrowser: boolean;
  isAutoPlayable: boolean;
  downloaded: number;
  total: number;
  speed: number;
  connections: number;
  fileSelection: {
    name: string;
    url: string;
    length: number;
    playFn?: () => void;
  }[];
  overlayMsg: string;
  isErrorAuth: boolean;
  settings: Settings;
  vBrowserResolution: string;
  vBrowserQuality: string;
  isVBrowserLarge: boolean;
  nonPlayableMedia: boolean;
  currentTab: string;
  isVBrowserModalOpen: boolean;
  isScreenShareModalOpen: boolean;
  isFileShareModalOpen: boolean;
  isSurpriseModalOpen: boolean;
  isMultiSelectModalOpen: boolean;
  roomLock: string;
  controller?: string;
  savedPasswords: StringDict;
  roomId: string;
  errorMessage: string;
  successMessage: string;
  warningMessage: string;
  isChatDisabled: boolean;
  showChatColumn: boolean;
  showPeopleColumn: boolean;
  owner: string | undefined;
  vanity: string | undefined;
  password: string | undefined;
  hasPassword: boolean;
  inviteLink: string;
  roomTitle: string | undefined;
  roomDescription: string | undefined;
  roomTitleColor: string | undefined;
  mediaPath: string | undefined;
  roomPlaybackRate: number;
  isLiveStream: boolean;
  settingsModalOpen: boolean;
  uploadController: AbortController | undefined;
  screenShareQualityMode: ShareQualityMode;
  youtubeQualityMode: YouTubeQualityMode;
  youtubeQualityLevels: YT.SuggestedVideoQuality[];
  showSearchHint: boolean;
  preJoinModalOpen: boolean;
  preJoinName: string;
  preJoinColor: string;
  liveReactions: LiveReactionBubble[];
  showLiveReactionTray: boolean;
  joinToasts: JoinToast[];
  countdownVisible: boolean;
  countdownText: string;
  countdownInProgress: boolean;
}

type ShareQualityMode = "economy" | "auto" | "high";

type ShareQualityProfile = {
  captureWidth: number;
  captureHeight: number;
  maxFramerate: number;
  maxBitratePerPeer: number;
  scaleResolutionDownBy?: number;
};

type LiveReactionEmoji = (typeof LIVE_REACTION_EMOJIS)[number];

type LiveReactionBubble = {
  id: string;
  user: string;
  emoji: LiveReactionEmoji;
  timestamp: string;
  x: number;
};

type JoinToast = {
  id: string;
  userId: string;
  name: string;
  color: string;
  initials: string;
};

function normalizeNameColor(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return /^#([0-9A-F]{6})$/.test(normalized)
    ? normalized
    : DEFAULT_NAME_COLOR;
}

function getDisplayInitials(value: string) {
  const parts = normalizeDisplayName(value).split(" ").filter(Boolean);
  if (!parts.length) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function toRgba(hex: string, alpha: number) {
  const normalized = normalizeNameColor(hex).replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class App extends React.Component<AppProps, AppState> {
  static contextType = MetadataContext;
  declare context: React.ContextType<typeof MetadataContext>;
  state: AppState = {
    state: "starting",
    roomMedia: "",
    roomPaused: false,
    roomLoop: false,
    participants: [],
    rosterUpdateTS: Date.now(),
    chat: [],
    playlist: [],
    tsMap: {},
    nameMap: {},
    pictureMap: {},
    nameColorMap: {},
    myName: normalizeDisplayName(
      window.localStorage.getItem("watchparty-username") ?? "",
    ),
    myNameColor: normalizeNameColor(
      window.localStorage.getItem(NAME_COLOR_STORAGE_KEY),
    ),
    myPicture: "",
    loading: true,
    scrollTimestamp: 0,
    unreadCount: 0,
    fullScreen: false,
    controlsTimestamp: 0,
    watchOptions: [],
    isVBrowser: false,
    isAutoPlayable: true,
    downloaded: 0,
    total: 0,
    speed: 0,
    connections: 0,
    fileSelection: [],
    overlayMsg: "",
    isErrorAuth: false,
    settings: {},
    vBrowserResolution: "1280x720@30",
    vBrowserQuality: "1",
    isVBrowserLarge: false,
    nonPlayableMedia: false,
    currentTab:
      new URLSearchParams(window.location.search).get("tab") ?? "chat",
    isVBrowserModalOpen: false,
    isScreenShareModalOpen: false,
    isFileShareModalOpen: false,
    isSurpriseModalOpen: false,
    isMultiSelectModalOpen: false,
    roomLock: "",
    controller: "",
    roomId: "",
    savedPasswords: {},
    errorMessage: "",
    successMessage: "",
    warningMessage: "",
    isChatDisabled: false,
    showChatColumn: isMobile()
      ? false
      : Boolean(
          Number(
            window.localStorage.getItem("watchparty-showchatcolumn") ?? "0",
          ),
        ),
    showPeopleColumn: false,
    // Boolean(
    //       Number(
    //         window.localStorage.getItem('watchparty-showpeoplecolumn') ?? '0',
    //       ),
    //     ),
    owner: undefined,
    vanity: undefined,
    password: undefined,
    hasPassword: false,
    inviteLink: "",
    roomTitle: "",
    roomDescription: "",
    roomTitleColor: "",
    mediaPath: undefined,
    roomPlaybackRate: 0,
    isLiveStream: false,
    settingsModalOpen: false,
    uploadController: undefined,
    screenShareQualityMode:
      window.localStorage.getItem("watchparty-ss-quality") === "economy"
        ? "economy"
        : window.localStorage.getItem("watchparty-ss-quality") === "high"
          ? "high"
          : "auto",
    youtubeQualityMode: normalizeYouTubeQuality(
      window.localStorage.getItem(YOUTUBE_QUALITY_STORAGE_KEY),
    ),
    youtubeQualityLevels: [],
    showSearchHint:
      window.localStorage.getItem(SEARCH_HINT_STORAGE_KEY) !== "1",
    preJoinModalOpen: true,
    preJoinName: "",
    preJoinColor: normalizeNameColor(
      window.localStorage.getItem(NAME_COLOR_STORAGE_KEY),
    ),
    liveReactions: [],
    showLiveReactionTray: false,
    joinToasts: [],
    countdownVisible: false,
    countdownText: "",
    countdownInProgress: false,
  };
  socket: Socket = null!;
  mediasoupPubSocket: Socket | null = null;
  mediasoupSubSocket: Socket | null = null;
  ytDebounce = true;
  localStreamToPublish?: MediaStream;
  isLocalStreamAFile = false;
  localFileObjectUrl: string | undefined = undefined;
  publisherConns: PCDict = {};
  lastAppliedShareProfileKey = "";
  viewerShareQualityMap: Record<string, ShareQualityMode> = {};
  consumerConn?: RTCPeerConnection;
  progressUpdater?: number;
  heartbeat: number | undefined = undefined;
  syncUpdater: number | undefined = undefined;
  warningMessageTimeout: number | undefined = undefined;
  errorMessageTimeout: number | undefined = undefined;
  successMessageTimeout: number | undefined = undefined;
  liveReactionCleanupTimeouts = new Map<string, number>();
  liveReactionTrayHideTimeout: number | undefined = undefined;
  joinToastTimeouts = new Map<string, number>();
  countdownTimeouts: number[] = [];
  lastLiveReactionSentAt = 0;
  suppressYouTubeStateSyncUntil = 0;
  authUnsubscribe: firebase.Unsubscribe | undefined = undefined;
  YouTubeInterface: YouTube = new YouTube(
    null,
    normalizeYouTubeQuality(
      window.localStorage.getItem(YOUTUBE_QUALITY_STORAGE_KEY),
    ),
  );
  HTMLInterface: HTML = new HTML("leftVideo");
  Player = () => {
    if (this.usingYoutube()) {
      return this.YouTubeInterface;
    } else {
      return this.HTMLInterface;
    }
  };

  chatRef = React.createRef<Chat>();

  async componentDidMount() {
    document.addEventListener("fullscreenchange", this.onFullScreenChange);
    document.addEventListener("keydown", this.onKeydown);
    const leftVideo = document.getElementById("leftVideo") as
      | HTMLVideoElement
      | null;
    leftVideo?.addEventListener(
      "enterpictureinpicture",
      this.onPictureInPictureChange,
    );
    leftVideo?.addEventListener(
      "leavepictureinpicture",
      this.onPictureInPictureChange,
    );
    window.addEventListener(
      "watchparty-profile-updated",
      this.onProfileUpdated as EventListener,
    );

    // Send heartbeat to the server
    this.heartbeat = window.setInterval(
      () => {
        fetch(serverPath + "/ping").catch((e) => {
          console.warn("[heartbeat] Falha ao enviar ping:", e);
        });
      },
      10 * 60 * 1000,
    );

    const canAutoplay = await testAutoplay();
    this.setState({ isAutoPlayable: canAutoplay });
    this.loadSettings();
    this.loadYouTube();
    if (config.VITE_FIREBASE_CONFIG) {
      this.authUnsubscribe = firebase
        .auth()
        .onAuthStateChanged(async (user: firebase.User | null) => {
          if (user) {
            this.loadSignInData(user);
          }
        });
    }
  }

  componentWillUnmount() {
    document.removeEventListener("fullscreenchange", this.onFullScreenChange);
    document.removeEventListener("keydown", this.onKeydown);
    const leftVideo = document.getElementById("leftVideo") as
      | HTMLVideoElement
      | null;
    leftVideo?.removeEventListener(
      "enterpictureinpicture",
      this.onPictureInPictureChange,
    );
    leftVideo?.removeEventListener(
      "leavepictureinpicture",
      this.onPictureInPictureChange,
    );
    window.removeEventListener(
      "watchparty-profile-updated",
      this.onProfileUpdated as EventListener,
    );
    window.clearInterval(this.heartbeat);
    window.clearInterval(this.progressUpdater);
    window.clearInterval(this.syncUpdater);
    window.clearTimeout(this.warningMessageTimeout);
    window.clearTimeout(this.liveReactionTrayHideTimeout);
    this.liveReactionCleanupTimeouts.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    this.liveReactionCleanupTimeouts.clear();
    this.joinToastTimeouts.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    this.joinToastTimeouts.clear();
    this.clearCountdownTimers();
    this.authUnsubscribe?.();
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    window.watchparty.socket = undefined;
    void this.stopPublishingLocalStream();
  }

  clearLocalFileObjectUrl = () => {
    if (this.localFileObjectUrl) {
      URL.revokeObjectURL(this.localFileObjectUrl);
      this.localFileObjectUrl = undefined;
    }
  };

  showWarningMessage = (warningMessage: string, durationMs = 3000) => {
    window.clearTimeout(this.warningMessageTimeout);
    this.setState({ warningMessage });
    this.warningMessageTimeout = window.setTimeout(() => {
      this.setState({ warningMessage: "" });
    }, durationMs);
  };

  dismissSearchHint = () => {
    if (!this.state.showSearchHint) {
      return;
    }
    this.setState({ showSearchHint: false });
    window.localStorage.setItem(SEARCH_HINT_STORAGE_KEY, "1");
  };

  confirmPreJoin = () => {
    const preJoinName =
      normalizeDisplayName(this.state.preJoinName) || DEFAULT_CHAT_NAME;
    const preJoinColor = normalizeNameColor(this.state.preJoinColor);
    window.localStorage.setItem("watchparty-username", preJoinName);
    window.localStorage.setItem(NAME_COLOR_STORAGE_KEY, preJoinColor);
    this.setState(
      {
        myName: preJoinName,
        myNameColor: preJoinColor,
        preJoinModalOpen: false,
      },
      this.init,
    );
  };

  onProfileUpdated = (event: CustomEvent<{ name?: string; avatar?: string }>) => {
    const newName = String(event.detail?.name ?? "").trim();
    const newAvatar = String(event.detail?.avatar ?? "").trim();
    if (newName) {
      this.updateName(newName, { forceFallback: true });
    }
    if (newAvatar) {
      this.updatePicture(newAvatar);
    } else if (this.context.user) {
      void getUserImage(this.context.user).then((image) => {
        if (image) {
          this.updatePicture(image);
        }
      });
    }
  };

  init = async () => {
    let roomId = "/" + this.props.urlRoomId;
    // if a vanity name, resolve the url to a room id
    if (this.props.vanity) {
      const resp = await fetch(
        serverPath + "/resolveRoom/" + this.props.vanity,
      );
      if (!resp.ok) {
        this.setState({ overlayMsg: "Não foi possível carregar esta sala." });
        return;
      }
      const data = await resp.json();
      if (!data?.roomId) {
        this.setState({ overlayMsg: "Não foi possível carregar esta sala." });
        return;
      }
      roomId = data.roomId;
    }
    this.setState({ roomId }, () => {
      this.join(roomId);
    });
  };

  join = async (roomId: string) => {
    const password = getSavedPasswords()[roomId] ?? "";
    const user = this.context.user;
    const uid = user?.uid ?? "";
    const token = user ? await user.getIdToken().catch(() => "") : "";
    const response = await fetch(serverPath + "/resolveShard" + roomId);
    const shard = Number(await response.text()) || "";
    const socket = io(serverPath + roomId, {
      transports: ["websocket"],
      query: {
        clientId,
        shard,
        roomId: roomId.slice(1),
      },
      auth: {
        sessionId: getOrCreateSessionId(),
        password,
        uid,
        token,
      },
    });
    this.socket = socket;
    window.watchparty.socket = socket;
    socket.removeAllListeners();
    socket.on("connect", async () => {
      this.setState({
        state: "connected",
        overlayMsg: "",
        errorMessage: "",
        successMessage: "",
        warningMessage: "",
      });
      this.updateName(this.state.myName || DEFAULT_CHAT_NAME, {
        forceFallback: true,
      });
      this.updateNameColor(this.state.myNameColor);
      this.loadSignInData(this.context.user);
      this.emitViewerShareQualityPreference();
    });
    socket.on("connect_error", (err: any) => {
      const message = String(err?.message ?? "");
      if (message === "Invalid namespace") {
        if (this.state.state === "starting") {
          this.setState({ overlayMsg: "Não foi possível carregar esta sala." });
        }
        return;
      }
      console.error(err);
      if (message === "password") {
        this.setState({ isErrorAuth: true });
      } else if (message) {
        const reconnectNoise =
          /reconnect|reconect|transport close|xhr poll error|websocket error/i;
        if (!reconnectNoise.test(message)) {
          this.showWarningMessage(message);
        }
      }
    });
    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        // Try to recover the socket silently to avoid UI overlap noise.
        socket.connect();
      }
      // For other disconnect reasons, socket.io auto-reconnect handles recovery.
    });
    socket.on("errorMessage", (err: string) => {
      this.setState({ errorMessage: err });
      window.clearTimeout(this.errorMessageTimeout);
      this.errorMessageTimeout = window.setTimeout(() => {
        this.setState({ errorMessage: "" });
      }, 3000);
    });
    socket.on("successMessage", (success: string) => {
      this.setState({ successMessage: success });
      window.clearTimeout(this.successMessageTimeout);
      this.successMessageTimeout = window.setTimeout(() => {
        this.setState({ successMessage: "" });
      }, 3000);
    });
    socket.on("kicked", () => {
      window.location.assign("/");
    });
    socket.on("REC:play", () => {
      this.suppressYouTubeStateSyncUntil = Date.now() + 1500;
      this.localPlay();
    });
    socket.on("REC:pause", () => {
      this.suppressYouTubeStateSyncUntil = Date.now() + 1500;
      this.localPause();
    });
    socket.on("REC:seek", (data: number) => {
      this.localSeek(data);
    });
    socket.on("REC:playbackRate", (data: number) => {
      this.setState({ roomPlaybackRate: data });
      if (data > 0) {
        this.Player().setPlaybackRate(data);
      }
    });
    socket.on("REC:loop", (data: boolean) => {
      this.setState({ roomLoop: data });
    });
    socket.on("REC:changeController", (data: string) => {
      this.setState({ controller: data });
    });
    socket.on("REC:host", async (data: HostState) => {
      let currentMedia = data.video || "";
      if (this.playingScreenShare() && !isScreenShare(currentMedia)) {
        this.stopPublishingLocalStream();
      }
      if (this.playingFileShare() && !isFileShare(currentMedia)) {
        this.stopPublishingLocalStream();
      }
      if (this.playingVBrowser() && !isVBrowser(currentMedia)) {
        this.stopVBrowser();
      }
      if (this.playingScreenShare() && isScreenShare(currentMedia)) {
        // Ignore, it's probably a reconnection
        return;
      }
      if (this.playingFileShare() && isFileShare(currentMedia)) {
        // Ignore, it's probably a reconnection
        return;
      }
      if (
        this.playingVBrowser() &&
        this.getVBrowserHost() &&
        isVBrowser(currentMedia)
      ) {
        // Ignore, it's probably a reconnection
        return;
      }
      this.setState(
        {
          roomMedia: currentMedia,
          roomPaused: data.paused,
          roomLoop: data.loop,
          roomPlaybackRate: data.playbackRate,
          loading: Boolean(data.video),
          nonPlayableMedia: false,
          isVBrowserLarge: data.isVBrowserLarge,
          vBrowserResolution: "1280x720@30",
          vBrowserQuality: "1",
          controller: data.controller,
          isLiveStream: false,
        },
        async () => {
          const leftVideo = this.HTMLInterface.getVideoEl();

          // Stop all players
          // Unless the user is sharing a file, because we play it in leftVideo and capture stream
          if (!this.isLocalStreamAFile) {
            this.HTMLInterface.pauseVideo();
          }
          this.YouTubeInterface.stopVideo();

          if (!this.isLocalStreamAFile) {
            this.Player().clearState();
          }
          if (data.playbackRate) {
            this.Player().setPlaybackRate(data.playbackRate);
          }

          if (
            this.playingScreenShare() ||
            this.playingFileShare() ||
            this.playingVBrowser()
          ) {
            console.log(
              "exiting REC:host since we are using webRTC (fileshare, screenshare, or vbrowser). Check setupRTCConnections()",
            );
            if (!(this.playingVBrowser() && !this.getVBrowserHost())) {
              // Remove the loader unless we're waiting for a vbrowser
              this.setLoadingFalse();
            }
            if (this.playingScreenShare() || this.playingFileShare()) {
              await this.setupRTCConnections();
            }
            return;
          }
          if (this.usingYoutube() && !this.YouTubeInterface.isReady()) {
            console.log(
              "YT player not ready, onReady callback will retry when it is",
            );
            return;
          }
          const src = data.video;
          const time = data.videoTS;
          if (isMagnet(src)) {
            if (!config.VITE_ENABLE_WEBTORRENT) {
              this.setState({
                loading: false,
                nonPlayableMedia: true,
                errorMessage:
                  "Links magnet estao desativados neste ambiente.",
              });
              setTimeout(() => {
                this.setState({ errorMessage: "" });
              }, 4000);
              return;
            }
            // WebTorrent
            if (!window.watchparty.webtorrent) {
              const WebTorrent = //@ts-expect-error
                (await import("webtorrent/dist/webtorrent.min.js")).default;
              window.watchparty.webtorrent = new WebTorrent();
              const reg = await navigator.serviceWorker?.register("/sw.min.js");
              const worker = reg.active || reg.waiting || reg.installing;
              const checkState = (worker: ServiceWorker | null) => {
                if (worker?.state === "activated") {
                  return window.watchparty.webtorrent?.createServer({
                    controller: reg,
                  });
                }
                return null;
              };
              if (!checkState(worker)) {
                worker?.addEventListener("statechange", ({ target }) =>
                  checkState(target as ServiceWorker),
                );
              }
            }
            await new Promise(async (resolve) => {
              const finish = (torrent: Torrent) => {
                // Got torrent metadata!
                console.log("Client is downloading:", torrent.infoHash);

                // Torrents can contain many files.
                const files = torrent.files;
                const fileIndex = new URLSearchParams(src).get("fileIndex");
                // Try to find a single large file to play
                let target;
                if (fileIndex != null && fileIndex !== "") {
                  target = files[Number(fileIndex)];
                }
                if (!target) {
                  // Open the selector
                  // Selecting a file sets a new URL with the fileIndex set so we go through again
                  this.setMultiSelectModal(true);
                  this.setFileSelection(
                    files.map((f: WebTorrent.TorrentFile, i: number) => ({
                      name: f.name,
                      url: src + `&fileIndex=${i}`,
                      length: f.length,
                    })),
                  );
                } else {
                  //@ts-expect-error
                  target.streamTo(leftVideo);
                }
                resolve(undefined);
              };
              let target = await window.watchparty.webtorrent?.get(src);
              if (!target) {
                target = window.watchparty.webtorrent?.add(src, {
                  announce: [
                    "wss://tracker.btorrent.xyz",
                    "wss://tracker.openwebtorrent.com",
                  ],
                  destroyStoreOnDestroy: true,
                  maxWebConns: 4,
                  path: "/tmp/webtorrent/",
                  storeCacheSlots: 20,
                  strategy: "sequential",
                  // noPeersIntervalTime: 30,
                });
              }
              if (target?.ready) {
                finish(target);
              } else {
                target?.on("ready", () => {
                  finish(target);
                });
              }
            });
          } else if (isDash(src)) {
            if (!window.watchparty.dash) {
              const Dash = await import("dashjs");
              window.watchparty.dash = Dash.MediaPlayer().create();
              window.watchparty.dash.on("streamInitialized", (_e: any) => {
                // for a live stream:
                // html.currenttime is time since stream start
                // html.duration is infinite
                // player.duration is the seekable range
                const isLiveStream = this.Player().getDuration() >= Infinity;
                console.log("DASH stream initialized: isLive %s", isLiveStream);
                this.setState({
                  isLiveStream,
                });
              });
            }
            window.watchparty.dash.initialize(leftVideo, src);
          } else if (isHls(src) && window.MediaSource) {
            // Prefer using hls.js if MediaSource Extensions are supported
            // otherwise fallback to native HLS support using video tag (i.e. iPhones)
            if (!window.watchparty.hls) {
              const Hls = (await import("hls.js")).default;
              window.watchparty.hls = new Hls();
              window.watchparty.hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
                const isLiveStream = data.details.live;
                this.setState({ isLiveStream });
                console.log("HLS level loaded: isLive %s", isLiveStream);
              });
            }
            window.watchparty.hls.loadSource(src);
            window.watchparty.hls.attachMedia(leftVideo);
          }
          // else if (isMpegTs(src)) {
          //   const mpegts = (await import('mpegts.js')).default;
          //   let player = mpegts.createPlayer({
          //     type: 'mse', // could also be mpegts, m2ts, flv
          //     // isLive: true,
          //     url: src,
          //   });
          //   player.attachMediaElement(leftVideo);
          //   player.load();
          //   player.play();
          // }
          else {
            if (this.usingYoutube()) {
              this.applyYouTubeQualityPreference();
            }
            await this.Player().setSrcAndTime(src, time);
          }
          // Start this video
          if (!data.paused) {
            this.localPlay();
          }
          // Do right before playing
          leftVideo?.addEventListener(
            "canplay",
            () => {
              this.setLoadingFalse();
              let ts = undefined;
              // WebTorrent and Hls and Dash reset position back to 0 so set it back here
              if (
                isMagnet(src) ||
                isHls(src) ||
                isDash(src) ||
                this.state.isLiveStream
              ) {
                ts = time;
              }
              // Resync to leader since the loading might have taken some time
              this.localSeek(ts);
              if (this.state.uploadController) {
                // Jump back to the start of the video
                this.roomSeek(0);
              }
              if (data.playbackRate) {
                // Set playback rate again since it might have been lost
                console.log("setting playback rate again", data.playbackRate);
                this.Player().setPlaybackRate(data.playbackRate);
              }
            },
            { once: true },
          );

          // Progress updater
          window.clearInterval(this.progressUpdater);
          this.setState({ downloaded: 0, total: 0, speed: 0 });
          if (currentMedia.includes("/stream?torrent=magnet")) {
            this.progressUpdater = window.setInterval(async () => {
              const response = await fetch(
                currentMedia.replace("/stream", "/progress"),
              );
              const data = await response.json();
              this.setState({
                downloaded: data.downloaded,
                total: data.total,
                speed: data.speed,
                connections: data.connections,
              });
            }, 1000);
          }
          if (isMagnet(currentMedia)) {
            window.clearInterval(this.progressUpdater);
            this.progressUpdater = window.setInterval(async () => {
              const client = window.watchparty.webtorrent;
              if (client) {
                this.setState({
                  downloaded: client.torrents[0]?.downloaded,
                  total: client.torrents[0]?.length,
                  speed: client.torrents[0]?.downloadSpeed,
                  connections: client.torrents[0]?.numPeers,
                });
              }
            }, 1000);
          }
        },
      );
    });
    socket.on("REC:chat", (data: ChatMessage) => {
      const isChatVisible =
        this.state.showChatColumn && !this.state.showPeopleColumn;
      const shouldPlayEventSound =
        (data.cmd === "shareStarted" || data.cmd === "userJoined") &&
        data.id !== clientId;
      if (
        !getCurrentSettings().disableChatSound &&
        shouldPlayEventSound &&
        ((document.visibilityState && document.visibilityState !== "visible") ||
          !isChatVisible)
      ) {
        this.playChatEventSound(String(data.cmd));
      }
      if (data.cmd === "userJoined" && data.id !== clientId) {
        this.enqueueJoinToast(data.id);
      }
      this.setState((prevState) => {
        const nextChat = [...prevState.chat, data].slice(-100);
        return {
          chat: nextChat,
          scrollTimestamp: Date.now(),
          unreadCount: isChatVisible
            ? prevState.unreadCount
            : prevState.unreadCount + (data.system ? 0 : 1),
        };
      });
    });
    socket.on(
      "REC:startCountdown",
      (data: { startAt?: number; seconds?: number; startedBy?: string }) => {
        this.handleStartCountdown(data);
      },
    );
    socket.on("REC:tsMap", (data: NumberDict) => {
      this.setState({ tsMap: data }, () => {
        // Dynamic playback rate based on timestamps
        // Disable for sharing types where the users can have different timestamps
        // e.g. screenshare, fileshare, .m3u8 HLS streams
        // Also not necessary for WebRTC sharing since it should be close to realtime
        if (
          !this.state.roomPaused &&
          !this.state.isLiveStream &&
          this.hasDuration() &&
          this.state.roomPlaybackRate === 0
        ) {
          const leader = this.getLeaderTime();
          const delta = leader - data[clientId];
          // Set leader pbr to 1
          let pbr = 1;
          // Add .01 pbr for each 100ms delay
          if (delta > 0.5) {
            pbr += Number((delta / 10).toFixed(2));
            pbr = Math.min(pbr, 1.1);
          }
          // console.log(delta, pbr);
          if (this.Player().getPlaybackRate() !== pbr) {
            this.Player().setPlaybackRate(pbr);
          }
        }
      });
    });
    socket.on("REC:nameMap", (data: StringDict) => {
      this.setState({ nameMap: data });
    });
    socket.on("REC:nameColorMap", (data: StringDict) => {
      this.setState({ nameColorMap: data });
    });
    socket.on("REC:pictureMap", (data: StringDict) => {
      this.setState({ pictureMap: data });
    });
    socket.on("REC:liveReaction", (data: LiveReactionEvent) => {
      const emoji = data?.emoji as LiveReactionEmoji;
      if (!LIVE_REACTION_EMOJIS.includes(emoji)) {
        return;
      }
      const bubbleId = `${data.user}-${data.timestamp}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
      const x = Math.floor(8 + Math.random() * 84);
      this.setState((prevState) => ({
        liveReactions: [
          ...prevState.liveReactions,
          {
            id: bubbleId,
            user: String(data.user ?? ""),
            emoji,
            timestamp: String(data.timestamp ?? new Date().toISOString()),
            x,
          },
        ],
      }));
      const timeoutId = window.setTimeout(() => {
        this.setState((prevState) => ({
          liveReactions: prevState.liveReactions.filter(
            (reaction) => reaction.id !== bubbleId,
          ),
        }));
        this.liveReactionCleanupTimeouts.delete(bubbleId);
      }, 2400);
      this.liveReactionCleanupTimeouts.set(bubbleId, timeoutId);
    });
    socket.on("REC:lock", (data: string) => {
      this.setState({ roomLock: data });
    });
    socket.on("roster", (data: User[]) => {
      this.setState({ participants: data, rosterUpdateTS: Date.now() }, () => {
        this.setupRTCConnections();
      });
    });
    socket.on("chatinit", (data: ChatMessage[]) => {
      this.setState({ chat: [...data], scrollTimestamp: Date.now() });
    });
    socket.on("playlist", (data: PlaylistVideo[]) => {
      this.setState({ playlist: data });
    });
    socket.on(
      "signalSS",
      async (data: {
        msg: { ice: any; sdp: any };
        from: string;
        sharer: boolean;
      }) => {
        config.NODE_ENV === "development" && console.log(data);
        // Handle messages received from signaling server
        const msg = data.msg;
        const from = data.from;
        // Determine whether the message came from the sharer or the sharee
        let pc = data.sharer
          ? this.ensureConsumerConnection(from)
          : this.publisherConns[from];
        if (!pc) {
          await this.setupRTCConnections();
          pc = data.sharer
            ? this.ensureConsumerConnection(from)
            : this.publisherConns[from];
          if (!pc) {
            console.warn(
              "[signalSS] peer connection indisponível para",
              from,
              data,
            );
            return;
          }
        }
        if (msg.ice !== undefined) {
          pc.addIceCandidate(new RTCIceCandidate(msg.ice));
        } else if (msg.sdp && msg.sdp.type === "offer") {
          // console.log('offer');
          // TODO Currently ios/Safari cannot handle this property, so remove it from the offer
          const _sdp = msg.sdp.sdp
            .split("\n")
            .filter((line: string) => {
              return line.trim() !== "a=extmap-allow-mixed";
            })
            .join("\n");
          msg.sdp.sdp = _sdp;
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          // Allow stereo audio
          answer.sdp = answer.sdp?.replace(
            "useinbandfec=1",
            "useinbandfec=1; stereo=1; maxaveragebitrate=510000",
          );
          // console.log(answer.sdp);
          // Allow multichannel audio if Chromium
          //@ts-expect-error
          const isChromium = Boolean(window.chrome);
          if (isChromium) {
            answer.sdp = answer.sdp
              ?.replace("opus/48000/2", "multiopus/48000/6")
              .replace(
                "useinbandfec=1",
                "channel_mapping=0,4,1,2,3,5; num_streams=4; coupled_streams=2;maxaveragebitrate=510000;minptime=10;useinbandfec=1",
              );
          }
          await pc.setLocalDescription(answer);
          this.sendSignalSS(from, { sdp: pc.localDescription }, !data.sharer);
        } else if (msg.sdp && msg.sdp.type === "answer") {
          pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        }
      },
    );
    socket.on("REC:getRoomState", this.handleRoomState);
    socket.on(
      "REC:setViewerShareQuality",
      (data: { viewerId?: string; mode?: ShareQualityMode }) => {
        const viewerId = String(data?.viewerId ?? "");
        if (!viewerId) {
          return;
        }
        this.viewerShareQualityMap[viewerId] = this.normalizeShareQualityMode(
          data?.mode,
        );
        void this.applyAdaptiveShareQuality();
      },
    );
    window.clearInterval(this.syncUpdater);
    this.syncUpdater = window.setInterval(() => {
      if (this.state.roomMedia) {
        const toSend = this.getRoomTSToSet(this.Player().getCurrentTime());
        this.socket.emit("CMD:ts", toSend);
      }
    }, 1000);
  };

  setFileSelection = (
    data: { name: string; url: string; length: number; playFn?: () => void }[],
  ) => {
    this.setState({ fileSelection: data });
  };

  setMultiSelectModal = (isMultiSelectModalOpen: boolean) => {
    this.setState({ isMultiSelectModalOpen });
  };

  resetMultiSelect = () => {
    this.setState({ isMultiSelectModalOpen: false, fileSelection: [] });
  };

  loadSettings = async () => {
    // Load settings from localstorage
    let settings = getCurrentSettings();
    this.setState({ settings });
  };

  loadSignInData = async (user: firebase.User | undefined) => {
    if (user && this.socket) {
      // NOTE: firebase auth doesn't provide the actual first name data that individual providers (G/FB) do
      // It's accessible at the time the user logs in but not afterward
      // If we want accurate surname/given name we'll need to save that somewhere
      const firstName = user.displayName?.split(" ")[0];
      if (firstName) {
        // Don't update the username if the user wants to customize their own
        // Set a flag in localstorage so we only update this once, if the user changes name manually later we won't overwrite
        // Clear the flag on logout
        const shouldUseLoginName =
          !window.localStorage.getItem("watchparty-loginname") &&
          (!this.state.myName || this.state.myName === DEFAULT_CHAT_NAME);
        if (shouldUseLoginName) {
          this.updateName(firstName);
          window.localStorage.setItem(
            "watchparty-loginname",
            Date.now().toString(),
          );
        }
      }
      const customAvatar = window.localStorage.getItem("watchparty-custom-avatar");
      const userImage = customAvatar || (await getUserImage(user));
      if (userImage) {
        this.updatePicture(userImage);
      }
      this.updateUid(user);
    }
  };

  loadYouTube = () => {
    // This code loads the IFrame Player API code asynchronously.
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.append(tag);
    window.onYouTubeIframeAPIReady = () => {
      // Note: this fails silently if the element is not available
      const ytPlayer = new window.YT.Player("leftYt", {
        playerVars: {
          controls: 0,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            console.log("yt onReady");
            this.YouTubeInterface = new YouTube(
              ytPlayer,
              this.state.youtubeQualityMode,
            );
            this.applyYouTubeQualityPreference();
            this.setState({ loading: false });
            // We might have failed to play YT originally, ask for the current video again
            if (this.usingYoutube()) {
              console.log("requesting host data again after ytReady");
              this.socket.emit("CMD:askHost");
            }
          },
          onStateChange: (e) => {
            if (
              this.usingYoutube() &&
              e.data === window.YT?.PlayerState?.CUED
            ) {
              this.applyYouTubeQualityPreference();
              this.setState({ loading: false });
            }
            if (
              this.usingYoutube() &&
              (e.data === window.YT?.PlayerState?.PLAYING ||
                e.data === window.YT?.PlayerState?.BUFFERING)
            ) {
              this.refreshYouTubeQualityLevels();
            }
            if (
              this.usingYoutube() &&
              e.data === window.YT?.PlayerState?.ENDED
            ) {
              console.log(e.data, e.target.getVideoUrl());
              this.onVideoEnded(e.target.getVideoUrl());
            }
            if (
              this.ytDebounce &&
              Date.now() >= this.suppressYouTubeStateSyncUntil &&
              ((e.data === window.YT?.PlayerState?.PLAYING &&
                (this.state.roomPaused ||
                  this.Player().getCurrentTime() <= 1)) ||
                (e.data === window.YT?.PlayerState?.PAUSED &&
                  !this.state.roomPaused))
            ) {
              this.ytDebounce = false;
              if (e.data === window.YT?.PlayerState?.PLAYING) {
                this.socket.emit("CMD:play");
                this.localPlay();
              } else {
                this.socket.emit("CMD:pause");
                this.localPause();
              }
              window.setTimeout(() => (this.ytDebounce = true), 500);
            }
          },
        },
      });
    };
  };

  // Functions for managing room settings
  getInviteLink = (vanity: string) => {
    if (vanity) {
      return `${window.location.origin}/r/${vanity}`;
    }
    return `${window.location.origin}/watch${this.state.roomId}`;
  };

  handleRoomState = (data: any) => {
    this.setOwner(data.owner);
    this.setVanity(data.vanity);
    if (Object.prototype.hasOwnProperty.call(data, "password")) {
      this.setPassword(data.password);
    }
    this.setHasPassword(Boolean(data.hasPassword ?? data.password));
    this.setInviteLink(this.getInviteLink(data.vanity));
    this.setIsChatDisabled(data.isChatDisabled);
    this.setRoomTitle(data.roomTitle || "Sala compartilhada");
    this.setRoomDescription(data.roomDescription);
    this.setRoomTitleColor(data.roomTitleColor);
    this.setMediaPath(data.mediaPath);
    window.history.replaceState("", "", this.getInviteLink(data.vanity));
  };

  setOwner = (owner: string) => {
    this.setState({ owner });
  };
  setVanity = (vanity: string | undefined) => {
    this.setState({ vanity });
  };
  setPassword = (password: string | undefined) => {
    this.setState({ password });
  };
  setHasPassword = (hasPassword: boolean) => {
    this.setState({ hasPassword });
  };
  setInviteLink = (inviteLink: string) => {
    this.setState({ inviteLink });
  };
  setRoomTitle = (roomTitle: string | undefined) => {
    this.setState({ roomTitle });
  };
  setRoomDescription = (roomDescription: string | undefined) => {
    this.setState({ roomDescription });
  };
  setRoomTitleColor = (roomTitleColor: string | undefined) => {
    this.setState({ roomTitleColor });
  };
  setMediaPath = (mediaPath: string | undefined) => {
    this.setState({ mediaPath });
  };

  setRoomLock = async (locked: boolean) => {
    this.socket.emit("CMD:lock", { locked });
  };

  haveLock = () => {
    if (!this.state.roomLock) {
      return true;
    }
    return this.context.user?.uid === this.state.roomLock;
  };

  setIsChatDisabled = (val: boolean) => this.setState({ isChatDisabled: val });

  clearChat = async () => {
    this.socket.emit("CMD:deleteChatMessages", {});
  };

  startConvert = async (sourceUrl?: string) => {
    const convertPath = this.context.convertPath;
    if (!convertPath) {
      this.setState({
        errorMessage:
          "Conversão de arquivo não está habilitada neste ambiente.",
      });
      return;
    }
    let stream = new ReadableStream();
    let file: File;
    if (!sourceUrl) {
      const files = await openFileSelector();
      if (!files || files.length === 0) {
        return;
      }
      file = files[0];
      // Start uploading stream
      stream = file.stream();
    }
    const uuid = createUuid();
    // const convertPath = "https://your-converter-host:5001";
    let convertUrl = convertPath + "/" + uuid + ".m3u8";
    convertUrl += sourceUrl ? "?url=" + encodeURIComponent(sourceUrl) : "";
    // Wait for the playlist to get generated
    const poll = async () => {
      let ok = false;
      let i = 0;
      while (!ok && i < 30) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const resp = await fetch(convertUrl);
        ok = resp.ok;
        i += 1;
      }
      // Same URL but GET
      this.roomSetMedia(convertUrl);
    };
    poll().catch((e) => {
      console.error("[poll] Falha ao aguardar playlist:", e);
    });
    const reader = stream.getReader();
    const start = Date.now();
    let bytes = 0;
    const ws = new WebSocket(convertUrl.replace("http", "ws"));
    ws.onmessage = async (_ev) => {
      try {
        // Server sends a message whenever it wants next chunk
        const { done, value } = await reader.read();
        if (value) {
          ws.send(value);
        }
        if (done) {
          ws.close();
        }
        const end = Date.now();
        bytes += value?.length ?? 0;
        this.setState({
          downloaded: bytes,
          total: file?.size,
          speed: done ? 0 : bytes / ((end - start) / 1000),
          connections: 1,
        });
      } catch (e) {
        console.error("[ws.onmessage] Erro ao ler chunk:", e);
        ws.close();
      }
    };
    ws.onerror = (ev) => {
      console.error("[ws] Erro na conexão WebSocket de conversão:", ev);
      this.setState({
        errorMessage: "Erro na conexão de upload. Tente novamente.",
      });
    };
    ws.onclose = () => {
      this.setState({ uploadController: undefined });
    };
    const controller = new AbortController();
    controller.signal.onabort = (_ev) => {
      ws.close();
    };
    this.setState({
      uploadController: controller,
    });
    // Note: If using fetch we can't read the response until the request completes
    // await fetch(convertUrl, {
    //   method: 'POST',
    //   body: stream,
    //   signal: this.state.uploadController?.signal,
    //   //@ts-expect-error
    //   duplex: 'half',
    // });
  };

  startFileShare = async (useMediaSoup: boolean) => {
    const files = await openFileSelector("video/*,.mkv,.webm,.mp4,.m4v,.mov,.avi");
    if (!files || files.length === 0) {
      return;
    }
    const file = files[0];
    const leftVideo = this.HTMLInterface.getVideoEl() as HTMLVideoElement | null;
    if (!leftVideo) {
      this.setState({
        errorMessage: "Não foi possível iniciar o compartilhamento de arquivo.",
      });
      return;
    }
    this.clearLocalFileObjectUrl();
    this.Player().clearState();
    const objectUrl = URL.createObjectURL(file);
    this.localFileObjectUrl = objectUrl;
    leftVideo.srcObject = null;
    leftVideo.src = objectUrl;
    leftVideo.currentTime = 0;
    try {
      if (leftVideo.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          let done = false;
          const timeout = window.setTimeout(() => {
            if (!done) {
              done = true;
              cleanup();
              reject(new Error("timeout_waiting_loadedmetadata"));
            }
          }, 8000);
          const cleanup = () => {
            window.clearTimeout(timeout);
            leftVideo.removeEventListener("loadedmetadata", onReady);
            leftVideo.removeEventListener("error", onError);
          };
          const onReady = () => {
            if (done) {
              return;
            }
            done = true;
            cleanup();
            resolve();
          };
          const onError = () => {
            if (done) {
              return;
            }
            done = true;
            cleanup();
            reject(new Error("video_load_error"));
          };
          leftVideo.addEventListener("loadedmetadata", onReady);
          leftVideo.addEventListener("error", onError);
        });
      }
    } catch {
      leftVideo.pause();
      this.Player().clearState();
      this.clearLocalFileObjectUrl();
      this.setState({
        errorMessage:
          "Não foi possível abrir este arquivo. Tente MP4/WebM ou use conversão.",
      });
      return;
    }
    try {
      await leftVideo.play();
    } catch {
      leftVideo.pause();
      this.Player().clearState();
      this.clearLocalFileObjectUrl();
      this.setState({
        errorMessage:
          "Não foi possível reproduzir este arquivo no navegador para compartilhar.",
      });
      return;
    }
    const captureStreamFn =
      (leftVideo as any).captureStream || (leftVideo as any).mozCaptureStream;
    if (typeof captureStreamFn !== "function") {
      leftVideo.pause();
      this.Player().clearState();
      this.clearLocalFileObjectUrl();
      this.setState({
        errorMessage:
          "Este navegador não suporta compartilhamento de arquivo. Use compartilhar tela.",
      });
      return;
    }
    this.localStreamToPublish = captureStreamFn.call(leftVideo);
    if (!this.localStreamToPublish?.getTracks()?.length) {
      leftVideo.pause();
      this.Player().clearState();
      this.clearLocalFileObjectUrl();
      this.setState({
        errorMessage:
          "Não foi possível capturar o arquivo para transmissão. Tente outro formato.",
      });
      return;
    }
    this.isLocalStreamAFile = true;
    if (this.localStreamToPublish) {
      this.socket.emit("CMD:joinScreenShare", {
        file: true,
        mediasoup: useMediaSoup,
      });
    }
  };

  getActiveShareViewerCount = () => {
    const selfId = getOrCreateClientId();
    return Math.max(
      1,
      this.state.participants.filter((p) => p.id !== selfId).length,
    );
  };

  getShareQualityProfile = (peerCount: number): ShareQualityProfile => {
    const peers = Math.max(1, peerCount);
    const totalBitrateBudget =
      peers <= 2
        ? 12_000_000
        : peers <= 4
          ? 14_000_000
          : peers <= 8
            ? 16_000_000
            : 18_000_000;
    const maxBitratePerPeer = Math.round(
      Math.max(1_200_000, Math.min(4_000_000, totalBitrateBudget / peers)),
    );
    let captureHeight = 720;
    if (maxBitratePerPeer < 1_500_000) {
      captureHeight = 540;
    }
    const captureWidth =
      captureHeight >= 1080 ? 1920 : captureHeight >= 720 ? 1280 : 960;
    const maxFramerate = maxBitratePerPeer < 1_600_000 ? 24 : 30;
    return {
      captureWidth,
      captureHeight,
      maxFramerate,
      maxBitratePerPeer,
    };
  };

  normalizeShareQualityMode = (value: unknown): ShareQualityMode => {
    if (value === "economy" || value === "high") {
      return value;
    }
    return "auto";
  };

  normalizeYouTubeQualityMode = (value: unknown): YouTubeQualityMode => {
    return normalizeYouTubeQuality(value);
  };

  refreshYouTubeQualityLevels = () => {
    const nextLevels = this.YouTubeInterface.getAvailableQualityLevels();
    this.setState((prevState) => {
      const currentLevels = prevState.youtubeQualityLevels;
      const hasSameLength = currentLevels.length === nextLevels.length;
      const hasSameValues =
        hasSameLength &&
        currentLevels.every((level, index) => level === nextLevels[index]);
      if (hasSameValues) {
        return null;
      }
      return {
        youtubeQualityLevels: nextLevels,
      };
    });
  };

  applyYouTubeQualityPreference = () => {
    this.YouTubeInterface.setPreferredQuality(this.state.youtubeQualityMode);
    this.refreshYouTubeQualityLevels();
  };

  setYouTubeQualityMode = (mode: YouTubeQualityMode) => {
    const normalized = this.normalizeYouTubeQualityMode(mode);
    this.setState({ youtubeQualityMode: normalized }, () => {
      window.localStorage.setItem(YOUTUBE_QUALITY_STORAGE_KEY, normalized);
      this.applyYouTubeQualityPreference();
      this.refreshControls();
    });
  };

  getYouTubeQualityOptions = (): YouTubeQualityMode[] => {
    const availableLevels = this.state.youtubeQualityLevels.filter(
      (level) => level !== "default",
    );
    const fallbackLevels: YT.SuggestedVideoQuality[] = [
      "highres",
      "hd1080",
      "hd720",
      "large",
      "medium",
      "small",
    ];
    const options: YouTubeQualityMode[] = [
      "auto",
      ...(availableLevels.length > 0 ? availableLevels : fallbackLevels),
    ];
    return Array.from(new Set(options));
  };

  getShareQualityLabel = (mode: ShareQualityMode) => {
    if (mode === "economy") {
      return "720p";
    }
    if (mode === "high") {
      return "1080p";
    }
    return "Auto";
  };

  getViewerSenderProfile = (
    baseProfile: ShareQualityProfile,
    mode: ShareQualityMode,
  ): ShareQualityProfile => {
    const resolveScaleResolutionDownBy = (
      captureHeight: number,
      targetHeight: number,
    ) => {
      if (captureHeight <= targetHeight) {
        return 1;
      }
      return Number((captureHeight / targetHeight).toFixed(2));
    };

    if (mode === "economy") {
      return {
        ...baseProfile,
        maxBitratePerPeer: Math.max(
          1_000_000,
          Math.min(3_000_000, Math.round(baseProfile.maxBitratePerPeer * 0.85)),
        ),
        maxFramerate: Math.min(baseProfile.maxFramerate, 24),
        // Target quality: 720p for this viewer, when host capture allows it.
        scaleResolutionDownBy: resolveScaleResolutionDownBy(
          baseProfile.captureHeight,
          720,
        ),
      };
    }
    if (mode === "high") {
      return {
        ...baseProfile,
        maxBitratePerPeer: Math.min(
          10_000_000,
          Math.max(4_500_000, Math.round(baseProfile.maxBitratePerPeer * 1.35)),
        ),
        maxFramerate: 30,
        // Target quality: 1080p for this viewer, when host capture allows it.
        scaleResolutionDownBy: resolveScaleResolutionDownBy(
          baseProfile.captureHeight,
          1080,
        ),
      };
    }
    return {
      ...baseProfile,
      scaleResolutionDownBy: 1,
    };
  };

  emitViewerShareQualityPreference = () => {
    const sharer = this.state.participants.find((p) => p.isScreenShare);
    const selfId = getOrCreateClientId();
    if (
      !this.socket?.connected ||
      !sharer ||
      sharer.id === selfId ||
      (!this.playingScreenShare() && !this.playingFileShare())
    ) {
      return;
    }
    this.socket.emit("CMD:setScreenShareQuality", {
      mode: this.state.screenShareQualityMode,
    });
  };

  setScreenShareQualityMode = (mode: ShareQualityMode) => {
    const normalized = this.normalizeShareQualityMode(mode);
    this.setState({ screenShareQualityMode: normalized }, () => {
      window.localStorage.setItem("watchparty-ss-quality", normalized);
      this.emitViewerShareQualityPreference();
    });
  };

  applyShareTrackConstraints = async (
    track: MediaStreamTrack,
    profile: ShareQualityProfile,
  ) => {
    try {
      await track.applyConstraints({
        width: { ideal: profile.captureWidth, max: profile.captureWidth },
        height: { ideal: profile.captureHeight, max: profile.captureHeight },
        frameRate: {
          ideal: profile.maxFramerate,
          max: profile.maxFramerate,
        },
      });
    } catch (e) {
      console.warn("screenshare: failed to apply track constraints", e);
    }
  };

  applyShareSenderQuality = async (
    viewerId: string,
    sender: RTCRtpSender,
    baseProfile: ShareQualityProfile,
  ) => {
    if (!sender.track || sender.track.kind !== "video") {
      return;
    }
    const mode = this.normalizeShareQualityMode(
      this.viewerShareQualityMap[viewerId] ?? "auto",
    );
    const profile = this.getViewerSenderProfile(baseProfile, mode);
    try {
      const params = sender.getParameters() as RTCRtpSendParameters & {
        degradationPreference?: RTCDegradationPreference;
      };
      const encodings =
        params.encodings && params.encodings.length > 0
          ? params.encodings
          : [{} as RTCRtpEncodingParameters];
      encodings[0] = {
        ...encodings[0],
        maxBitrate: profile.maxBitratePerPeer,
        maxFramerate: profile.maxFramerate,
        scaleResolutionDownBy: profile.scaleResolutionDownBy,
      };
      params.encodings = encodings;
      params.degradationPreference = "balanced";
      await sender.setParameters(params);
    } catch (e) {
      console.warn("screenshare: failed to apply sender parameters", e);
    }
  };

  applyAdaptiveShareQuality = async () => {
    if (!this.localStreamToPublish || this.isLocalStreamAFile) {
      this.lastAppliedShareProfileKey = "";
      return;
    }
    const videoTrack = this.localStreamToPublish.getVideoTracks()[0];
    if (!videoTrack) {
      return;
    }
    videoTrack.contentHint = "detail";
    const peerCount = this.getActiveShareViewerCount();
    const profile = this.getShareQualityProfile(peerCount);
    const profileKey = `${profile.captureWidth}x${profile.captureHeight}@${profile.maxFramerate}:${profile.maxBitratePerPeer}`;
    if (profileKey !== this.lastAppliedShareProfileKey) {
      await this.applyShareTrackConstraints(videoTrack, profile);
      this.lastAppliedShareProfileKey = profileKey;
      console.log(
        `[screenshare] quality profile ${profile.captureWidth}x${profile.captureHeight}@${profile.maxFramerate} ${Math.round(profile.maxBitratePerPeer / 1000)}kbps/peer peers=${peerCount}`,
      );
    }
    await Promise.all(
      Object.entries(this.publisherConns).map(([viewerId, pc]) =>
        Promise.all(
          pc
            .getSenders()
            .map((sender) =>
              this.applyShareSenderQuality(viewerId, sender, profile),
            ),
        ),
      ),
    );
  };

  startScreenShare = async (useMediaSoup: boolean) => {
    if (navigator.mediaDevices?.getDisplayMedia) {
      try {
        const videoConstraints: MediaTrackConstraints & {
          logicalSurface?: boolean;
        } = {
          logicalSurface: true,
          height: 720,
        };
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: videoConstraints,
          audio: {
            autoGainControl: false,
            channelCount: 2,
            echoCancellation: false,
            noiseSuppression: false,
            sampleRate: 48000,
            sampleSize: 16,
          },
        });
        this.localStreamToPublish = stream;
        this.isLocalStreamAFile = false;
        await this.applyAdaptiveShareQuality();
        this.socket.emit("CMD:joinScreenShare", {
          file: false,
          mediasoup: useMediaSoup,
        });
      } catch (e: any) {
        if (e?.name !== "NotAllowedError") {
          this.showWarningMessage(
            "Não foi possível iniciar o compartilhamento de tela.",
          );
        }
      }
    } else {
      this.showWarningMessage(
        "Compartilhar tela ainda não é suportado em navegadores mobile.",
      );
    }
  };

  // Share the video to mediasoup
  publishMediasoup = async (mediasoupURL: string) => {
    const localStream = this.localStreamToPublish;
    let device: MediasoupClient.types.Device = null as any;
    let producerTransport: MediasoupClient.types.Transport = null as any;

    // =========== socket.io ==========
    const connectSocket = (mediasoupURL: string) => {
      return new Promise<void>((resolve, reject) => {
        this.mediasoupPubSocket = io(mediasoupURL, {
          transports: ["websocket"],
        });

        const socket = this.mediasoupPubSocket;
        socket?.on("connect", function () {
          console.log("PUBLISH: connected to socket.io");
          resolve();
        });
        socket?.on("error", function (err) {
          console.error("PUBLISH: socket.io ERROR:", err);
          reject(err);
        });
      });
    };

    const sendRequest = (type: string, data: any) => {
      return new Promise<any>((resolve, reject) => {
        const socket = this.mediasoupPubSocket;
        socket?.emit(type, data, (err: any, response: any) => {
          if (!err) {
            // Success response, so pass the mediasoup response to the local Room.
            resolve(response);
          } else {
            reject(err);
          }
        });
      });
    };

    async function publish() {
      // --- get transport info ---
      console.log("PUBLISH: --- createProducerTransport --");
      const params = await sendRequest("createProducerTransport", {});
      console.log("PUBLISH: transport params:", params);
      producerTransport = device.createSendTransport(params);
      console.log("PUBLISH: createSendTransport:", producerTransport);

      // --- join & start publish --
      producerTransport.on(
        "connect",
        async (
          {
            dtlsParameters,
          }: { dtlsParameters: MediasoupClient.types.DtlsParameters },
          callback: () => void,
          errback: (error: Error) => void,
        ) => {
          console.log("PUBLISH: --transport connect");
          sendRequest("connectProducerTransport", {
            dtlsParameters: dtlsParameters,
          })
            .then(callback)
            .catch(errback);
        },
      );

      producerTransport.on(
        "produce",
        async (
          {
            kind,
            rtpParameters,
          }: {
            kind: string;
            rtpParameters: MediasoupClient.types.RtpParameters;
          },
          callback: ({ id }: { id: string }) => void,
          errback: (error: Error) => void,
        ) => {
          console.log("PUBLISH: --transport produce");
          try {
            const { id } = await sendRequest("produce", {
              transportId: producerTransport.id,
              kind,
              rtpParameters,
            });
            callback({ id });
          } catch (err: any) {
            errback(err);
          }
        },
      );

      // producerTransport.on('connectionstatechange', (state: string) => {
      //   switch (state) {
      //     case 'connecting':
      //       console.log('PUBLISH: connecting');
      //       break;

      //     case 'connected':
      //       console.log('PUBLISH: connected');
      //       break;

      //     case 'failed':
      //       console.log('PUBLISH: failed');
      //       producerTransport.close();
      //       break;

      //     default:
      //       break;
      //   }
      // });

      const videoTrack = localStream?.getVideoTracks()[0];
      if (videoTrack) {
        const trackParams = { track: videoTrack };
        await producerTransport.produce(trackParams);
      }
      const audioTrack = localStream?.getAudioTracks()[0];
      if (audioTrack) {
        const trackParams = { track: audioTrack };
        await producerTransport.produce(trackParams);
      }
    }

    async function loadDevice(
      routerRtpCapabilities: MediasoupClient.types.RtpCapabilities,
    ) {
      const { Device } = await import("mediasoup-client");
      device = new Device();
      await device.load({ routerRtpCapabilities });
    }

    await connectSocket(mediasoupURL);
    // --- get capabilities --
    const data = await sendRequest("getRouterRtpCapabilities", {});
    console.log("PUBLISH: getRouterRtpCapabilities:", data);
    await loadDevice(data);
    await publish();
  };

  // Play the video from MediaSoup
  subscribeMediasoup = async (mediaSoupURL: string) => {
    let device: MediasoupClient.types.Device = null as any;
    let consumerTransport: MediasoupClient.types.Transport = null as any;
    // =========== socket.io ==========

    const connectSocket = () => {
      return new Promise<void>((resolve, reject) => {
        this.mediasoupSubSocket = io(mediaSoupURL, {
          transports: ["websocket"],
        });
        const socket = this.mediasoupSubSocket;
        socket?.on("connect", function () {
          console.log("SUBSCRIBE: connected to socket.io");
          resolve();
        });
        socket?.on("error", function (err) {
          console.error("SUBSCRIBE: socket.io ERROR:", err);
          reject(err);
        });
        socket?.on("newProducer", async function (message) {
          console.log("SUBSCRIBE: socket.io newProducer:", message);
          if (consumerTransport) {
            // start consume
            if (message.kind === "video") {
              await consumeAndResume(message.kind);
            } else if (message.kind === "audio") {
              await consumeAndResume(message.kind);
            }
          }
        });

        // socket?.on('producerClosed', function (message) {
        //   console.log('socket.io producerClosed:', message);
        //   const localId = message.localId;
        //   const remoteId = message.remoteId;
        //   const kind = message.kind;
        //   if (kind === 'video') {
        //     if (videoConsumer) {
        //       videoConsumer.close();
        //       videoConsumer = null;
        //     }
        //   } else if (kind === 'audio') {
        //     if (audioConsumer) {
        //       audioConsumer.close();
        //       audioConsumer = null;
        //     }
        //   }
        // });
      });
    };

    const sendRequest = (type: string, data: any) => {
      return new Promise<any>((resolve, reject) => {
        const socket = this.mediasoupSubSocket;
        socket?.emit(type, data, (err: Error, response: any) => {
          if (!err) {
            // Success response, so pass the mediasoup response to the local Room.
            resolve(response);
          } else {
            reject(err);
          }
        });
      });
    };

    // =========== media handling ==========
    const addRemoteTrack = (track: MediaStreamTrack) => {
      let video = this.HTMLInterface.getVideoEl();
      if (video.srcObject) {
        // Track already exists, add it
        (video.srcObject as MediaStream).addTrack(track);
      } else {
        const mediaStream = new MediaStream();
        mediaStream.addTrack(track);
        video.srcObject = mediaStream;
      }
      this.localPlay();
    };

    async function consumeAndResume(kind: string) {
      const consumer = await consume(consumerTransport, kind);
      if (consumer) {
        console.log("SUBSCRIBE: -- track exist, consumer ready. kind=" + kind);
        if (kind === "video") {
          console.log("SUBSCRIBE: -- resume kind=" + kind);
          sendRequest("resume", { kind: kind })
            .then(() => {
              console.log("SUBSCRIBE: resume OK");
              return consumer;
            })
            .catch((err) => {
              console.error("SUBSCRIBE: resume ERROR:", err);
              return consumer;
            });
        } else {
          console.log("SUBSCRIBE: -- do not resume kind=" + kind);
        }
      } else {
        console.log("SUBSCRIBE: -- no consumer yet. kind=" + kind);
        return null;
      }
    }

    async function loadDevice(
      routerRtpCapabilities: MediasoupClient.types.RtpCapabilities,
    ) {
      try {
        const { Device } = await import("mediasoup-client");
        device = new Device();
        await device.load({ routerRtpCapabilities });
      } catch (error: any) {
        if (error.name === "UnsupportedError") {
          console.error("browser not supported");
        }
      }
    }

    async function consume(
      transport: MediasoupClient.types.Transport,
      trackKind: string,
    ) {
      console.log("SUBSCRIBE: --start of consume --kind=" + trackKind);
      const { rtpCapabilities } = device;
      const data = await sendRequest("consume", {
        rtpCapabilities: rtpCapabilities,
        kind: trackKind,
      }).catch((err) => {
        console.error("SUBSCRIBE: ERROR:", err);
      });
      const { producerId, id, kind, rtpParameters } = data;

      if (producerId) {
        let codecOptions = {};
        const consumer = await transport.consume({
          id,
          producerId,
          kind,
          rtpParameters,
          //@ts-expect-error
          codecOptions,
        });

        addRemoteTrack(consumer.track);
        console.log("SUBSCRIBE: --end of consume");
        return consumer;
      } else {
        console.warn("SUBSCRIBE: ---remote producer NOT READY");
        return null;
      }
    }

    async function subscribe() {
      console.log("SUBSCRIBE: ---createConsumerTransport --");
      const params = await sendRequest("createConsumerTransport", {});
      console.log("SUBSCRIBE: transport params:", params);
      consumerTransport = device.createRecvTransport(params);
      console.log("SUBSCRIBE: createConsumerTransport:", consumerTransport);

      // --- join & start watching
      consumerTransport.on(
        "connect",
        async (
          {
            dtlsParameters,
          }: { dtlsParameters: MediasoupClient.types.DtlsParameters },
          callback: () => void,
          errback: (err: Error) => void,
        ) => {
          console.log("SUBSCRIBE: ---consumer transport connect");
          sendRequest("connectConsumerTransport", {
            dtlsParameters: dtlsParameters,
          })
            .then(callback)
            .catch(errback);
        },
      );

      // consumerTransport.on('connectionstatechange', (state: string) => {
      //   switch (state) {
      //     case 'connecting':
      //       console.log('SUBSCRIBE: connecting');
      //       break;

      //     case 'connected':
      //       console.log('SUBSCRIBE: connected');
      //       break;

      //     case 'failed':
      //       console.log('SUBSCRIBE: failed');
      //       consumerTransport.close();
      //       break;

      //     default:
      //       break;
      //   }
      // });

      await consumeAndResume("video");
      await consumeAndResume("audio");
    }

    // Clear the srcobject so we load our stream when received
    const leftVideo = this.HTMLInterface.getVideoEl();
    leftVideo.srcObject = null;
    await connectSocket();
    // --- get capabilities --
    const data = await sendRequest("getRouterRtpCapabilities", {});
    console.log("getRouterRtpCapabilities:", data);
    await loadDevice(data);
    await subscribe();
  };

  stopPublishingLocalStream = async () => {
    if (this.localStreamToPublish && this.socket?.connected) {
      this.socket.emit("CMD:leaveScreenShare");
      // We don't actually need to unmute if it's a fileshare but this is fine
      this.localSetMute(false);
    }
    this.localStreamToPublish &&
      this.localStreamToPublish.getTracks().forEach((track) => {
        track.stop();
      });
    this.localStreamToPublish = undefined;
    if (this.consumerConn) {
      this.consumerConn.close();
      this.consumerConn = undefined;
    }
    Object.values(this.publisherConns).forEach((pc) => {
      pc.close();
    });
    this.publisherConns = {};
    this.lastAppliedShareProfileKey = "";
    this.viewerShareQualityMap = {};
    this.isLocalStreamAFile = false;
    this.clearLocalFileObjectUrl();
    if (this.mediasoupPubSocket) {
      this.mediasoupPubSocket.close();
      this.mediasoupPubSocket = null;
    }
    if (this.mediasoupSubSocket) {
      this.mediasoupSubSocket.close();
      this.mediasoupSubSocket = null;
    }
  };

  ensureConsumerConnection = (sharerId: string) => {
    if (this.consumerConn || this.isLocalStreamAFile) {
      return this.consumerConn;
    }
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    this.consumerConn = pc;
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalSS(sharerId, { ice: event.candidate });
      }
    };
    pc.ontrack = (event: RTCTrackEvent) => {
      const leftVideo = this.HTMLInterface.getVideoEl();
      if (leftVideo) {
        leftVideo.src = "";
        leftVideo.srcObject = event.streams[0];
        this.localPlay();
      }
    };
    return pc;
  };

  setupRTCConnections = async () => {
    if (!this.playingScreenShare() && !this.playingFileShare()) {
      return;
    }
    const sharer = this.state.participants.find((p) => p.isScreenShare);
    const selfId = getOrCreateClientId();
    const localTrack = this.localStreamToPublish?.getVideoTracks()[0];
    if (localTrack && !localTrack.onended) {
      // Stop sharing if the local stream stops
      localTrack.onended = () => this.stopPublishingLocalStream();
    }
    if (this.state.roomMedia.includes("@")) {
      let prefix = "screenshare://";
      if (this.playingFileShare()) {
        prefix = "fileshare://";
      }
      const unprefixed = this.state.roomMedia.replace(prefix, "");
      const mediasoupURL = unprefixed.split("@")[1];
      if (sharer?.id === selfId && this.mediasoupPubSocket == null) {
        await this.publishMediasoup(mediasoupURL);
      }
      if (sharer?.id === selfId) {
        await this.applyAdaptiveShareQuality();
      }
      // If we're not sharing a file, also start watching
      // avoid duplicate watching if the socket already exists
      if (!this.isLocalStreamAFile && this.mediasoupSubSocket == null) {
        await this.subscribeMediasoup(mediasoupURL);
      }
      return;
    }

    // We're the sharer, create a connection to each other member
    if (sharer?.id === selfId) {
      // Delete and close any connections that aren't in the current member list (maybe someone disconnected)
      // This allows them to rejoin later
      const clientIds = new Set(this.state.participants.map((p) => p.id));
      Object.entries(this.publisherConns).forEach(([key, value]) => {
        if (!clientIds.has(key)) {
          value.close();
          delete this.publisherConns[key];
        }
      });
      Object.keys(this.viewerShareQualityMap).forEach((viewerId) => {
        if (!clientIds.has(viewerId)) {
          delete this.viewerShareQualityMap[viewerId];
        }
      });

      this.state.participants.forEach((user) => {
        const id = user.id;
        if (id === selfId && this.isLocalStreamAFile) {
          // Don't set up a connection to ourselves if sharing file
          return;
        }
        if (!this.publisherConns[id]) {
          // Set up the RTCPeerConnection for sharing media to each member
          const pc = new RTCPeerConnection({ iceServers: iceServers() });
          this.publisherConns[id] = pc;
          this.localStreamToPublish?.getTracks().forEach((track) => {
            if (this.localStreamToPublish != null) {
              pc.addTrack(track, this.localStreamToPublish);
            }
          });
          pc.onicecandidate = (event) => {
            // We generated an ICE candidate, send it to peer
            if (event.candidate) {
              this.sendSignalSS(id, { ice: event.candidate }, true);
            }
          };
          pc.onnegotiationneeded = async () => {
            // Start connection for peer's video
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.sendSignalSS(id, { sdp: pc.localDescription }, true);
          };
        }
      });
      await this.applyAdaptiveShareQuality();
    }
    if (sharer && sharer.id !== selfId) {
      this.emitViewerShareQualityPreference();
    }
    // We're a watcher, establish connection to sharer
    // If screensharing, sharer also does this
    // If filesharing, sharer does not do this since we use leftVideo
    if (sharer && !this.consumerConn && !this.isLocalStreamAFile) {
      this.ensureConsumerConnection(sharer.id);
    }
  };

  startVBrowser = async (options: {
    size: string;
    region?: string;
    targetUrl?: string;
  }) => {
    this.socket.emit("CMD:startVBrowser", { options });
  };

  stopVBrowser = async () => {
    this.socket.emit("CMD:stopVBrowser");
  };

  changeController = async (value: string | null) => {
    // console.log(data);
    this.socket.emit("CMD:changeController", value);
  };

  sendSignalSS = async (to: string, data: any, sharer?: boolean) => {
    // console.log('sendSS', to, data);
    this.socket.emit("signalSS", { to, msg: data, sharer });
  };

  usingYoutube = () => {
    return isYouTube(this.state.roomMedia);
  };

  usingNative = () => {
    // Anything that uses HTML Video (e.g. not YouTube, Vimeo, or other embedded JS player)
    return !this.usingYoutube();
  };

  hasDuration = () => {
    // Youtube, link, or magnet, etc. Has a defined runtime (not WebRTC)
    return isHttp(this.state.roomMedia) || isMagnet(this.state.roomMedia);
  };

  playingScreenShare = () => {
    return isScreenShare(this.state.roomMedia);
  };

  playingFileShare = () => {
    return isFileShare(this.state.roomMedia);
  };

  playingVBrowser = () => {
    return isVBrowser(this.state.roomMedia);
  };

  decodeBase64Url = (value: string) => {
    try {
      const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
      const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
      return window.atob(normalized + padding);
    } catch {
      return "";
    }
  };

  getVBrowserData = () => {
    const raw = this.state.roomMedia.replace("vbrowser://", "");
    const atIndex = raw.lastIndexOf("@");
    const pass = atIndex >= 0 ? raw.slice(0, atIndex) : "";
    const rest = atIndex >= 0 ? raw.slice(atIndex + 1) : raw;
    const openSeparator = "::open::";
    const openIndex = rest.indexOf(openSeparator);
    const host =
      openIndex >= 0 ? rest.slice(0, openIndex) : rest;
    const openToken =
      openIndex >= 0
        ? rest.slice(openIndex + openSeparator.length)
        : "";
    const openUrl = openToken ? this.decodeBase64Url(openToken) : "";
    return { pass: pass.trim(), host: host.trim(), openUrl };
  };

  getVBrowserPass = () => {
    return this.getVBrowserData().pass;
  };

  getVBrowserHost = () => {
    return this.getVBrowserData().host;
  };

  getVBrowserLaunchUrl = () => {
    return this.getVBrowserData().openUrl;
  };

  isPauseDisabled = () => {
    return this.playingScreenShare() || this.playingVBrowser();
  };

  localSeek = (customTime?: number) => {
    // Jump to the leader's position, or a custom one
    let target = customTime ?? this.getLeaderTime();
    // For live this is the offset from the leading edge (negative)
    if (this.state.isLiveStream) {
      target = this.Player().getDuration() + (customTime ?? 0);
    }
    if (target >= 0 && target < Infinity) {
      console.log("syncing self to leader or custom:", target);
      this.Player().seekVideo(target);
    }
  };

  localPlay = async () => {
    if (!this.state.roomMedia) {
      return;
    }
    const canAutoplay = this.state.isAutoPlayable || (await testAutoplay());
    this.setState(
      { roomPaused: false, isAutoPlayable: canAutoplay },
      async () => {
        if (
          !this.state.isAutoPlayable ||
          (this.localStreamToPublish && !this.isLocalStreamAFile)
        ) {
          console.log("auto-muting to allow autoplay or screenshare host");
          this.localSetMute(true);
        } else {
          this.localSetMute(false);
        }
        try {
          await this.Player().playVideo();
        } catch (e: any) {
          console.warn(e, e.name);
          if (e.name === "NotSupportedError" && this.usingNative()) {
            this.setState({ loading: false, nonPlayableMedia: true });
          }
        }
      },
    );
  };

  localPause = () => {
    this.setState({ roomPaused: true }, async () => {
      this.Player().pauseVideo();
    });
  };

  localSetMute = (muted: boolean) => {
    this.Player().setMute(muted);
    this.refreshControls();
  };

  localSetVolume = (volume: number) => {
    this.Player().setVolume(volume);
    this.refreshControls();
  };

  roomSetPlaybackRate = (rate: number) => {
    // emit an event to the server
    this.socket.emit("CMD:playbackRate", rate);
  };

  roomSetLoop = (loop: boolean) => {
    this.socket.emit("CMD:loop", loop);
  };

  roomTogglePlay = () => {
    if (!this.haveLock()) {
      return;
    }
    if (this.isPauseDisabled()) {
      return;
    }
    const shouldPlay = this.Player().shouldPlay();
    if (shouldPlay) {
      this.socket.emit("CMD:play");
      this.localPlay();
    } else {
      this.socket.emit("CMD:pause");
      this.localPause();
    }
  };

  roomSeek = (time: number) => {
    let target = time;
    target = Math.max(target, 0);
    this.Player().seekVideo(target);
    const toSend = this.getRoomTSToSet(target);
    this.socket.emit("CMD:seek", toSend);
  };

  getRoomTSToSet = (time: number) => {
    let target = time;
    // In live case, can't just send video time because clients may have different durations
    // Take the passed time and compute the offset from the end time (negative)
    // Each client should use this value to compute the time to set when starting playback
    if (this.state.isLiveStream) {
      target = time - this.Player().getDuration();
    }
    // Otherwise just return the time
    return target;
  };

  onFullScreenChange = () => {
    this.setState({ fullScreen: Boolean(document.fullscreenElement) });
    if (!document.fullscreenElement) {
      const orientationApi = (
        screen as Screen & {
          orientation?: { unlock?: () => void };
        }
      ).orientation;
      orientationApi?.unlock?.();
    }
    setTimeout(() => this.chatRef.current?.scrollToBottom(), 100);
  };

  onPictureInPictureChange = () => {
    this.refreshControls();
  };

  onKeydown = (e: any) => {
    if (!document.activeElement || document.activeElement.tagName === "BODY") {
      if (e.key === " ") {
        e.preventDefault();
        this.roomTogglePlay();
      } else if (e.key === "ArrowRight") {
        this.roomSeek(this.Player().getCurrentTime() + 10);
      } else if (e.key === "ArrowLeft") {
        this.roomSeek(this.Player().getCurrentTime() - 10);
      } else if (e.key === "f") {
        this.localFullScreen(true);
      } else if (e.key === "m") {
        this.localToggleMute();
      }
    }
  };

  localFullScreen = async (bVideoOnly: boolean) => {
    // Default: fullscreen the body (theater mode)
    let container = document.body as HTMLElement;
    if (bVideoOnly || isMobile()) {
      if (this.playingVBrowser() && !isMobile()) {
        // vbrowser needs to fullscreen the control wrapper div
        // Can't really control the VBrowser on mobile anyway, so just fullscreen the video
        container = document.getElementById("leftVideoParent") as HTMLElement;
      } else {
        // fullscreen player shell so floating chat remains available
        container =
          (document.getElementById("watchPlayerShell") as HTMLElement) ??
          this.Player().getVideoEl();
      }
    }
    if (
      !container.requestFullscreen &&
      //@ts-expect-error
      container.webkitEnterFullScreen
    ) {
      // e.g. iPhone doesn't allow requestFullscreen
      //@ts-expect-error
      container.webkitEnterFullscreen();
      return;
    }
    if (!document.fullscreenElement) {
      // not currently in fullscreen
      await container.requestFullscreen();
      if (isMobile()) {
        const orientationApi = (
          screen as Screen & {
            orientation?: {
              lock?: (
                orientation:
                  | "any"
                  | "natural"
                  | "landscape"
                  | "portrait"
                  | "portrait-primary"
                  | "portrait-secondary"
                  | "landscape-primary"
                  | "landscape-secondary",
              ) => Promise<void>;
            };
          }
        ).orientation;
        try {
          await orientationApi?.lock?.("landscape");
        } catch {
          // Some mobile browsers ignore orientation lock requests.
        }
      }
    } else {
      // e.g. switching from video fullscreen to theater mode
      const bChangeElements = document.fullscreenElement !== container;
      await document.exitFullscreen();
      if (bChangeElements) {
        await container.requestFullscreen();
      }
    }
  };

  localToggleMute = () => {
    this.localSetMute(!this.Player().isMuted());
  };

  isPictureInPictureSupported = () => {
    if (!this.usingNative() || this.playingVBrowser()) {
      return false;
    }
    const doc = document as Document & {
      exitPictureInPicture?: () => Promise<void>;
    };
    const video = this.HTMLInterface.getVideoEl() as HTMLVideoElement | null;
    return Boolean(
      video &&
        typeof video.requestPictureInPicture === "function" &&
        typeof doc.exitPictureInPicture === "function",
    );
  };

  isPictureInPictureActive = () => {
    if (!this.usingNative()) {
      return false;
    }
    const doc = document as Document & {
      pictureInPictureElement?: Element | null;
    };
    const video = this.HTMLInterface.getVideoEl();
    return Boolean(video && doc.pictureInPictureElement === video);
  };

  localTogglePictureInPicture = async () => {
    if (!this.isPictureInPictureSupported()) {
      this.showWarningMessage("Picture in Picture indisponível neste navegador.");
      return;
    }
    const doc = document as Document & {
      pictureInPictureElement?: Element | null;
      exitPictureInPicture?: () => Promise<void>;
    };
    const video = this.HTMLInterface.getVideoEl() as HTMLVideoElement;
    try {
      if (doc.pictureInPictureElement === video) {
        await doc.exitPictureInPicture?.();
      } else {
        if (doc.pictureInPictureElement) {
          await doc.exitPictureInPicture?.();
        }
        await video.requestPictureInPicture();
      }
    } catch (e) {
      console.warn("[picture-in-picture]", e);
      this.showWarningMessage("Não foi possível ativar Picture in Picture.");
    } finally {
      this.refreshControls();
    }
  };

  roomSetMedia = (value: string) => {
    this.socket.emit("CMD:host", value);
  };

  roomPlaylistPlay = (index: number) => {
    this.roomSetMedia(this.state.playlist[index]?.url);
    this.roomPlaylistDelete(index);
  };

  roomPlaylistAdd = (value: string) => {
    this.socket.emit("CMD:playlistAdd", value);
  };

  roomPlaylistMove = (index: number, toIndex: number) => {
    this.socket.emit("CMD:playlistMove", { index, toIndex });
  };

  roomPlaylistDelete = (index: number) => {
    this.socket.emit("CMD:playlistDelete", index);
  };

  updateName = (name: string, options?: { forceFallback?: boolean }) => {
    const normalized = normalizeDisplayName(name);
    const nextName = normalized || (options?.forceFallback ? DEFAULT_CHAT_NAME : "");
    this.setState({ myName: nextName });
    if (!nextName) {
      return;
    }
    this.socket.emit("CMD:name", nextName);
    window.localStorage.setItem("watchparty-username", nextName);
  };

  updateNameColor = (color: string) => {
    const nextColor = normalizeNameColor(color);
    this.setState((prevState) => ({
      myNameColor: nextColor,
      nameColorMap: {
        ...prevState.nameColorMap,
        [clientId]: nextColor,
      },
    }));
    if (this.socket?.connected) {
      this.socket.emit("CMD:nameColor", { value: nextColor });
    }
    window.localStorage.setItem(NAME_COLOR_STORAGE_KEY, nextColor);
  };

  showLiveReactionTray = (autoHideMs?: number) => {
    window.clearTimeout(this.liveReactionTrayHideTimeout);
    this.setState({ showLiveReactionTray: true });
    if (autoHideMs && autoHideMs > 0) {
      this.liveReactionTrayHideTimeout = window.setTimeout(() => {
        this.setState({ showLiveReactionTray: false });
      }, autoHideMs);
    }
  };

  hideLiveReactionTray = () => {
    window.clearTimeout(this.liveReactionTrayHideTimeout);
    this.setState({ showLiveReactionTray: false });
  };

  toggleLiveReactionTrayMobile = () => {
    const nextVisible = !this.state.showLiveReactionTray;
    if (nextVisible) {
      this.showLiveReactionTray(2600);
      return;
    }
    this.hideLiveReactionTray();
  };

  sendLiveReaction = (emoji: LiveReactionEmoji) => {
    const now = Date.now();
    if (now - this.lastLiveReactionSentAt < 1000) {
      return;
    }
    this.lastLiveReactionSentAt = now;
    this.socket.emit("CMD:liveReaction", {
      emoji,
      nonce: createUuid(),
    });
    if (isMobile()) {
      this.showLiveReactionTray(2600);
    }
  };

  updatePicture = (url: string) => {
    this.setState({ myPicture: url });
    this.socket.emit("CMD:picture", url);
  };

  updateUid = async (user: firebase.User) => {
    const uid = user.uid;
    const token = await user.getIdToken();
    this.socket.emit("CMD:uid", { uid, token });
  };

  getMediaDisplayName = (input?: string) => {
    if (!input) {
      return "";
    }
    // Show the whole URL for youtube
    if (this.usingYoutube()) {
      return input;
    }
    if (input.startsWith("screenshare://")) {
      const sharer = this.state.participants.find((user) => user.isScreenShare);
      return "Tela de " + (this.state.nameMap[sharer?.id ?? ""] || "usuario");
    }
    if (input.startsWith("fileshare://")) {
      const sharer = this.state.participants.find((user) => user.isScreenShare);
      return (
        "Arquivo de " + (this.state.nameMap[sharer?.id ?? ""] || "usuario")
      );
    }
    if (input.startsWith("vbrowser://")) {
      return "Navegador virtual" + (this.state.isVBrowserLarge ? "+" : "");
    }
    if (isMagnet(input)) {
      const magnetParsed = new URLSearchParams(input);
      const index = magnetParsed.get("fileIndex");
      return magnetParsed.get("dn") + (index != null ? ` (arquivo ${index})` : "");
    }
    if (input.includes("/stream?torrent=magnet")) {
      const search = new URL(input).search;
      const searchParsed = new URLSearchParams(search);
      const magnetUrl = searchParsed.get("torrent") ?? "";
      const magnetParsed = new URLSearchParams(magnetUrl);
      const index = searchParsed.get("fileIndex");
      return (
        (magnetParsed.get("dn") ?? searchParsed.get("dn")) +
        (index != null ? ` (arquivo ${index})` : "")
      );
    }
    if (input.includes("/proxy")) {
      const urlParsed = new URLSearchParams(input);
      const displayName = urlParsed.get("displayName");
      if (displayName) {
        return displayName;
      }
    }
    return input;
  };

  setLoadingFalse = () => {
    this.setState({ loading: false });
  };

  getLeaderTime = () => {
    if (this.state.participants.length > 2) {
      return calculateMedian(Object.values(this.state.tsMap));
    }
    return Math.max(...Object.values(this.state.tsMap));
  };

  onVideoEnded = (url: string) => {
    this.localPause();
    // check if looping is on, if so set time back to 0 and restart
    if (this.state.roomLoop) {
      this.localSeek(0);
      this.localPlay();
      return;
    }
    if (this.state.playlist.length) {
      // Pass the url of the video at the time this video was started
      this.socket.emit("CMD:playlistNext", url);
      return;
    }
    // Play next fileIndex
    const re = /&fileIndex=(\d+)$/;
    const match = re.exec(this.state.roomMedia);
    if (match) {
      const fileIndex = match[1];
      const nextNum = Number(fileIndex) + 1;
      const nextUrl = this.state.roomMedia.replace(
        /&fileIndex=(\d+)$/,
        `&fileIndex=${nextNum}`,
      );
      this.roomSetMedia(nextUrl);
    }
  };

  refreshControls = () => {
    this.setState({ controlsTimestamp: Date.now() });
  };

  playChatEventSound = (eventType: string) => {
    try {
      const sound = new Audio("/clearly.mp3");
      if (eventType === "userJoined") {
        sound.playbackRate = 1.28;
        sound.volume = 0.78;
      } else {
        sound.playbackRate = 1;
        sound.volume = 1;
      }
      void sound.play();
    } catch {
      // Ignore notification sound failures.
    }
  };

  enqueueJoinToast = (userId: string) => {
    if (!userId || userId === clientId) {
      return;
    }
    const name = normalizeDisplayName(this.state.nameMap[userId] || "Convidado");
    const color = normalizeNameColor(this.state.nameColorMap[userId]);
    const toastId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toast: JoinToast = {
      id: toastId,
      userId,
      name,
      color,
      initials: getDisplayInitials(name),
    };
    this.setState((prevState) => ({
      joinToasts: [...prevState.joinToasts, toast].slice(-4),
    }));
    const timeoutId = window.setTimeout(() => {
      this.joinToastTimeouts.delete(toastId);
      this.setState((prevState) => ({
        joinToasts: prevState.joinToasts.filter((item) => item.id !== toastId),
      }));
    }, 3500);
    this.joinToastTimeouts.set(toastId, timeoutId);
  };

  clearCountdownTimers = () => {
    this.countdownTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    this.countdownTimeouts = [];
  };

  handleStartCountdown = (data: {
    startAt?: number;
    seconds?: number;
    startedBy?: string;
  }) => {
    const seconds = Math.max(3, Number(data?.seconds ?? 3));
    const baseStart = Number.isFinite(Number(data?.startAt))
      ? Number(data.startAt)
      : Date.now();
    const startDelay = Math.max(0, baseStart - Date.now());
    const sequence = Array.from({ length: seconds }, (_, index) =>
      String(seconds - index),
    );
    this.clearCountdownTimers();
    this.setState({
      countdownVisible: true,
      countdownInProgress: true,
      countdownText: sequence[0] ?? "3",
    });
    sequence.forEach((text, index) => {
      const timeoutId = window.setTimeout(() => {
        this.setState({ countdownText: text });
      }, startDelay + index * 1000);
      this.countdownTimeouts.push(timeoutId);
    });
    const playTimeout = window.setTimeout(() => {
      this.setState({ countdownText: "PLAY!" });
    }, startDelay + sequence.length * 1000);
    this.countdownTimeouts.push(playTimeout);
    const hideTimeout = window.setTimeout(() => {
      this.setState({
        countdownVisible: false,
        countdownText: "",
        countdownInProgress: false,
      });
      this.clearCountdownTimers();
    }, startDelay + sequence.length * 1000 + 800);
    this.countdownTimeouts.push(hideTimeout);
  };

  startCountdown = () => {
    if (!this.haveLock() || this.state.countdownInProgress || !this.state.roomMedia) {
      return;
    }
    this.socket?.emit("CMD:startCountdown");
  };

  commitRoomTitle = (nextTitle: string) => {
    const title = normalizeDisplayName(nextTitle).slice(0, 40);
    this.setState({ roomTitle: title });
    if (!this.socket?.connected || !this.state.owner || this.context.user?.uid !== this.state.owner) {
      return;
    }
    this.socket.emit("CMD:setRoomState", {
      vanity: this.state.vanity ?? "",
      isChatDisabled: this.state.isChatDisabled,
      roomTitle: title,
      roomDescription: this.state.roomDescription ?? "",
      roomTitleColor: this.state.roomTitleColor || "#888888",
      mediaPath: this.state.mediaPath ?? "",
    });
  };

  setSettingsModalOpen = (settingsModalOpen: boolean) => {
    this.setState({ settingsModalOpen });
  };

  render() {
    const sharer = this.state.participants.find((p) => p.isScreenShare);
    const selfId = getOrCreateClientId();
    const unreadLabel =
      this.state.unreadCount === 1 ? "mensagem não lida" : "mensagens não lidas";
    const unreadAriaLabel = `${this.state.unreadCount} ${unreadLabel}`;
    const unreadBadgeLabel = isMobile()
      ? String(this.state.unreadCount)
      : unreadAriaLabel;
    const canAdjustScreenShareQuality = Boolean(
      sharer &&
        sharer.id !== selfId &&
        (this.playingScreenShare() || this.playingFileShare()),
    );
    const canAdjustYouTubeQuality = Boolean(this.usingYoutube());
    const isHostUser = Boolean(
      (this.state.owner && this.context.user?.uid === this.state.owner) ||
        (this.state.roomLock && this.context.user?.uid === this.state.roomLock),
    );
    const canTriggerCountdown = Boolean(
      isHostUser &&
        this.haveLock() &&
        this.state.roomMedia &&
        !this.playingScreenShare() &&
        !this.playingFileShare() &&
        !this.playingVBrowser(),
    );
    const canStopHostedMedia = Boolean(
      this.haveLock() &&
        this.state.roomMedia &&
        !this.localStreamToPublish &&
        !this.playingScreenShare() &&
        !this.playingFileShare() &&
        !this.playingVBrowser(),
    );
    const playlist = this.state.playlist;
    const controls = (
      <Controls
        muted={this.Player().isMuted()}
        volume={this.Player().getVolume()}
        localFullScreen={this.localFullScreen}
        localToggleMute={this.localToggleMute}
        localSetVolume={this.localSetVolume}
        localTogglePictureInPicture={this.localTogglePictureInPicture}
        pictureInPictureSupported={this.isPictureInPictureSupported()}
        pictureInPictureActive={this.isPictureInPictureActive()}
        screenShareQualityMode={this.state.screenShareQualityMode}
        setScreenShareQualityMode={this.setScreenShareQualityMode}
        showShareQualityControl={canAdjustScreenShareQuality}
        youtubeQualityMode={this.state.youtubeQualityMode}
        youtubeQualityOptions={this.getYouTubeQualityOptions()}
        setYouTubeQualityMode={this.setYouTubeQualityMode}
        showYouTubeQualityControl={canAdjustYouTubeQuality}
        showCountdownControl={canTriggerCountdown}
        countdownInProgress={this.state.countdownInProgress}
        onStartCountdown={this.startCountdown}
      />
    );
    return (
      <React.Fragment>
        {this.state.isMultiSelectModalOpen && (
          <MultiStreamModal
            streams={this.state.fileSelection}
            setMedia={this.roomSetMedia}
            resetMultiSelect={this.resetMultiSelect}
            startConvert={this.startConvert}
          />
        )}
        {VBROWSER_ENABLED && this.state.isVBrowserModalOpen && (
          <VBrowserModal
            closeModal={() => this.setState({ isVBrowserModalOpen: false })}
            startVBrowser={this.startVBrowser}
          />
        )}
        {this.state.isScreenShareModalOpen && (
          <ScreenShareModal
            closeModal={() => this.setState({ isScreenShareModalOpen: false })}
            startScreenShare={this.startScreenShare}
          />
        )}
        {this.state.isFileShareModalOpen && (
          <FileShareModal
            closeModal={() => this.setState({ isFileShareModalOpen: false })}
            startFileShare={this.startFileShare}
          />
        )}
        {this.state.isSurpriseModalOpen && (
          <SurpriseModal
            opened={this.state.isSurpriseModalOpen}
            onClose={() => this.setState({ isSurpriseModalOpen: false })}
            onPlayTogether={(url) => this.roomSetMedia(url)}
          />
        )}
        {this.state.state === "starting" && !this.state.preJoinModalOpen && (
          <Overlay className={styles.flexCenter}>
            <Title order={2}>Carregando...</Title>
          </Overlay>
        )}
        {this.state.preJoinModalOpen && (
          <Modal
            opened
            onClose={() => {}}
            withCloseButton={false}
            closeOnClickOutside={false}
            closeOnEscape={false}
            centered
            size={400}
            title="Entrar como convidado"
            classNames={{
              content: styles.preJoinModalContent,
              header: styles.preJoinModalHeader,
              title: styles.preJoinModalTitle,
              body: styles.preJoinModalBody,
            }}
          >
            <div className={styles.preJoinContent}>
              {(() => {
                const previewName = normalizeDisplayName(this.state.preJoinName);
                const displayName = previewName || "Seu nome";
                const color = normalizeNameColor(this.state.preJoinColor);
                return (
                  <div className={styles.preJoinPreview}>
                    <div
                      className={styles.preJoinPreviewAvatar}
                      style={{
                        background: toRgba(color, 0.22),
                        borderColor: toRgba(color, 0.5),
                        color,
                      }}
                    >
                      {getDisplayInitials(displayName)}
                    </div>
                    <div
                      className={styles.preJoinPreviewName}
                      style={{
                        color: previewName ? color : "var(--text-muted)",
                      }}
                    >
                      {displayName}
                    </div>
                  </div>
                );
              })()}
              <TextInput
                label="Apelido"
                placeholder="Seu apelido ou nome"
                value={this.state.preJoinName}
                maxLength={40}
                autoFocus
                onChange={(e) =>
                  this.setState({ preJoinName: e.target.value })
                }
              />
              <div className={styles.preJoinColorBlock}>
                <div className={styles.preJoinColorLabel}>Cor do nome</div>
                <div className={styles.preJoinColorGrid}>
                  {PRESET_NAME_COLORS.map((color) => {
                    const selected = this.state.preJoinColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        className={`${styles.preJoinColorSwatch} ${
                          selected ? styles.preJoinColorSwatchSelected : ""
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => this.setState({ preJoinColor: color })}
                        aria-label={`Selecionar cor ${color}`}
                        title={color}
                      >
                        {selected ? (
                          <span className={styles.preJoinColorCheck}>✓</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Button color="webgold" onClick={this.confirmPreJoin}>
                Entrar na sala
              </Button>
            </div>
          </Modal>
        )}
        {this.state.overlayMsg && <ErrorModal error={this.state.overlayMsg} />}
        {this.state.isErrorAuth && <PasswordModal roomId={this.state.roomId} />}
        <SettingsModal
          modalOpen={this.state.settingsModalOpen}
          setModalOpen={this.setSettingsModalOpen}
          roomLock={this.state.roomLock}
          setRoomLock={this.setRoomLock}
          socket={this.socket}
          roomId={this.state.roomId}
          isChatDisabled={this.state.isChatDisabled}
          setIsChatDisabled={this.setIsChatDisabled}
          owner={this.state.owner}
          setOwner={this.setOwner}
          vanity={this.state.vanity}
          setVanity={this.setVanity}
          inviteLink={this.state.inviteLink}
          password={this.state.password}
          hasPassword={this.state.hasPassword}
          setPassword={this.setPassword}
          clearChat={this.clearChat}
          roomTitle={this.state.roomTitle}
          setRoomTitle={this.setRoomTitle}
          roomDescription={this.state.roomDescription}
          setRoomDescription={this.setRoomDescription}
          roomTitleColor={this.state.roomTitleColor}
          setRoomTitleColor={this.setRoomTitleColor}
          mediaPath={this.state.mediaPath}
          setMediaPath={this.setMediaPath}
          myNameColor={this.state.myNameColor}
          setMyNameColor={this.updateNameColor}
        />
        {this.state.errorMessage && (
          <Alert
            title="Erro"
            color="red"
            style={{
              position: "fixed",
              bottom: "10px",
              right: "10px",
              zIndex: 1000,
            }}
          >
            {this.state.errorMessage}
          </Alert>
        )}
        {this.state.successMessage && (
          <Alert
            title="Sucesso"
            color="webgold"
            style={{
              position: "fixed",
              bottom: "10px",
              right: "10px",
              zIndex: 1000,
            }}
          >
            {this.state.successMessage}
          </Alert>
        )}
        {this.state.warningMessage && (
          <Alert
            color="yellow"
            // header={this.state.warningMessage}
            style={{
              position: "fixed",
              top: "10px",
              left: "50%",
              transform: "translate(-50%, 0)",
              zIndex: 1000,
            }}
          >
            {this.state.warningMessage}
          </Alert>
        )}
        {this.state.joinToasts.length > 0 && (
          <div className={styles.joinToastStack} aria-live="polite">
            {this.state.joinToasts.map((toast) => (
              <div key={toast.id} className={styles.joinToast}>
                <div
                  className={styles.joinToastAvatar}
                  style={{
                    background: toRgba(toast.color, 0.2),
                    borderColor: toRgba(toast.color, 0.46),
                    color: toast.color,
                  }}
                >
                  {toast.initials}
                </div>
                <div className={styles.joinToastText}>
                  <span style={{ color: toast.color }}>{toast.name}</span> entrou
                  na sala
                </div>
              </div>
            ))}
          </div>
        )}
        {!this.state.fullScreen && (
          <TopBar
            hideNewRoom
            roomTitle={this.state.roomTitle}
            roomDescription={this.state.roomDescription}
            roomTitleColor={this.state.roomTitleColor}
            roomTitleEditable={Boolean(
              this.state.owner && this.context.user?.uid === this.state.owner,
            )}
            onRoomTitleCommit={this.commitRoomTitle}
          />
        )}
        {
          <div className={`${styles.roomShell} ${styles.mobileStack}`}>
            <div
              className={
                (this.state.fullScreen
                  ? styles.fullHeightColumnFullscreen
                  : styles.fullHeightColumn) +
                " " +
                styles.leftColumn
              }
            >
              <div className={styles.leftColumnInner}>
                {!this.state.fullScreen && (
                  <section className={styles.commandDeck}>
                    <div className={`${styles.commandRow} ${styles.searchRow}`}>
                      <div
                        className={styles.searchFieldWrap}
                        onClickCapture={this.dismissSearchHint}
                      >
                        <div className={styles.searchField}>
                          <ComboBox
                            roomSetMedia={this.roomSetMedia}
                            playlistAdd={this.roomPlaylistAdd}
                            roomMedia={this.state.roomMedia}
                            getMediaDisplayName={this.getMediaDisplayName}
                            disabled={!this.haveLock()}
                            showClear={false}
                          />
                        </div>
                        {this.state.showSearchHint && (
                          <button
                            type="button"
                            className={styles.searchHint}
                            onClick={this.dismissSearchHint}
                          >
                            Cole aqui o link do YouTube para começar 🎬
                          </button>
                        )}
                      </div>
                      <div className={styles.topActions}>
                        {canStopHostedMedia && (
                          <Button
                            color="red"
                            onClick={() => this.roomSetMedia("")}
                            leftSection={<IconX />}
                            className={styles.topActionButton}
                          >
                            Parar transmissão
                          </Button>
                        )}
                        {this.localStreamToPublish && (
                          <Button
                            color="red"
                            onClick={this.stopPublishingLocalStream}
                            leftSection={<IconX />}
                            className={styles.topActionButton}
                          >
                            {t("stopShare")}
                          </Button>
                        )}
                        {this.playingVBrowser() && this.haveLock() && (
                          <Button
                            color="red"
                            onClick={this.stopVBrowser}
                            leftSection={<IconX />}
                            className={styles.topActionButton}
                          >
                            {t("stopVBrowser")}
                          </Button>
                        )}
                        {this.state.uploadController && (
                          <Button
                            color="red"
                            onClick={() => {
                              this.state.uploadController?.abort();
                            }}
                            leftSection={<IconX />}
                            className={styles.topActionButton}
                          >
                            Parar conversão
                          </Button>
                        )}
                        <Menu>
                          <Menu.Target>
                            <Button
                              data-testid="playlist-button"
                              color="grey"
                              leftSection={<IconList />}
                              rightSection={<Badge circle>{playlist.length}</Badge>}
                              className={`${styles.shareButton} ${styles.topActionButton}`}
                            >
                              {t("playlist")}
                            </Button>
                          </Menu.Target>
                          <Menu.Dropdown
                            className={styles.queueDropdown}
                            style={{
                              overflowY: playlist.length > 0 ? "scroll" : undefined,
                              maxHeight: 400,
                              maxWidth: "min(92vw, 600px)",
                            }}
                          >
                            {playlist.length === 0 && (
                              <Menu.Item disabled>Não há itens na fila.</Menu.Item>
                            )}
                            {playlist.map((item: PlaylistVideo, index: number) => {
                              const normalizedItem = Boolean(item.img)
                                ? { ...item, type: "youtube" }
                                : item;
                              return (
                                <Menu.Item key={index} className={styles.queueItem}>
                                  <ChatVideoCard
                                    video={normalizedItem}
                                    index={index}
                                    controls
                                    onPlay={this.roomPlaylistPlay}
                                    onPlayNext={(index) => {
                                      this.roomPlaylistMove(index, 0);
                                    }}
                                    onRemove={(index) => {
                                      this.roomPlaylistDelete(index);
                                    }}
                                    disabled={!this.haveLock()}
                                  />
                                </Menu.Item>
                              );
                            })}
                          </Menu.Dropdown>
                        </Menu>
                        <InviteButton className={styles.topActionButton} />
                        <Button
                          color="grey"
                          leftSection={<IconUsersGroup />}
                          rightSection={
                            <Badge circle>{this.state.participants.length}</Badge>
                          }
                          className={styles.topActionButton}
                          onClick={() =>
                            this.setState((prevState) => {
                              window.localStorage.setItem(
                                "watchparty-showchatcolumn",
                                "1",
                              );
                              return {
                                showChatColumn: true,
                                showPeopleColumn: true,
                                unreadCount: prevState.unreadCount,
                              };
                            })
                          }
                        >
                          Pessoas
                        </Button>
                        <Button
                          data-testid="settings-button"
                          color="grey"
                          title="Configurações"
                          onClick={() => {
                            this.setSettingsModalOpen(true);
                          }}
                          leftSection={<IconSettings />}
                          className={styles.topActionButton}
                        >
                          Configurações
                        </Button>
                        <TextInput
                          className={styles.nameInput}
                          size="xs"
                          value={this.state.myName}
                          onChange={(e) => this.updateName(e.target.value)}
                          maxLength={40}
                          placeholder="Seu nome"
                          aria-label="Nome no chat"
                          title="Nome no chat"
                          leftSection={<IconUser size={14} />}
                        />
                        <label
                          className={styles.nameColorControl}
                          title="Cor do nome"
                          aria-label="Cor do nome"
                        >
                          <input
                            type="color"
                            value={this.state.myNameColor}
                            onChange={(e) => this.updateNameColor(e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                  </section>
                )}
                <div className={styles.playerArea} id="watchPlayerShell">
                  <div className={styles.playerContainer}>
                    {Boolean(
                      sharer &&
                        sharer.id !== selfId &&
                        (this.playingScreenShare() || this.playingFileShare()),
                    ) && (
                      <div className={styles.liveShareBadge}>
                        <span className={styles.liveShareDot} />
                        <span className={styles.liveShareLabel}>AO VIVO</span>
                        <span className={styles.liveShareOwner}>
                          Tela de {this.state.nameMap[sharer!.id] || "Participante"}
                        </span>
                      </div>
                    )}
                    {this.state.countdownVisible && (
                      <div className={styles.countdownOverlay}>
                        <div
                          className={`${styles.countdownText} ${
                            this.state.countdownText === "PLAY!"
                              ? styles.countdownTextPlay
                              : ""
                          }`}
                        >
                          {this.state.countdownText}
                        </div>
                      </div>
                    )}
                    {!this.state.isAutoPlayable && this.state.roomMedia && (
                      <Overlay className={styles.flexCenter}>
                        <Button
                          onClick={() => {
                            this.setState({ isAutoPlayable: true });
                            this.localSetMute(false);
                            this.localSetVolume(1);
                          }}
                          leftSection={<IconVolume />}
                          size="xl"
                        >
                          Ativar som
                        </Button>
                      </Overlay>
                    )}
                    {(this.state.loading ||
                      !this.state.roomMedia ||
                      this.state.nonPlayableMedia) &&
                      !this.state.isLiveStream && (
                        <div
                          id="loader"
                          className={`${styles.videoContent} ${styles.flexCenter}`}
                        >
                          {this.state.loading && (
                            <div
                              className={`${styles.flexCenter} ${styles.loaderStack}`}
                            >
                              <Loader />
                              <div>
                                {this.playingVBrowser()
                                  ? VBROWSER_ENABLED
                                    ? "Iniciando navegador virtual. Isso pode levar até 1 minuto."
                                    : "Navegador virtual temporariamente indisponível."
                                  : ""}
                              </div>
                            </div>
                          )}
                          {!this.state.loading &&
                            !this.state.roomMedia &&
                            !this.localStreamToPublish &&
                            !sharer &&
                            !this.playingVBrowser() && (
                              <div className={styles.emptyStateCard}>
                                <div
                                  className={styles.emptyStatePulse}
                                  aria-hidden="true"
                                >
                                  <div className={styles.emptyStatePulseIcon}>
                                    ▶
                                  </div>
                                </div>
                                <div className={styles.emptyStateTitle}>
                                  Inicie uma transmissão
                                </div>
                                <div className={styles.emptyStateSubtitle}>
                                  Compartilhe sua tela ou envie um arquivo para
                                  a sala.
                                </div>
                                <div className={styles.emptyActions}>
                                  <Button
                                    data-testid="empty-screenshare-button"
                                    className={styles.emptyActionButton}
                                    color="webgold"
                                    disabled={!this.haveLock()}
                                    onClick={() => {
                                      this.setState({
                                        isScreenShareModalOpen: true,
                                      });
                                    }}
                                    leftSection={<IconScreenShare />}
                                  >
                                    {t("screenshare")}
                                  </Button>
                                  <Button
                                    data-testid="empty-file-button"
                                    className={styles.emptyActionButton}
                                    color="webgold"
                                    disabled={!this.haveLock()}
                                    onClick={() => {
                                      this.setState({
                                        isFileShareModalOpen: true,
                                      });
                                    }}
                                    leftSection={<IconFile />}
                                  >
                                    Arquivo
                                  </Button>
                                </div>
                                <button
                                  type="button"
                                  data-testid="empty-surprise-button"
                                  className={styles.emptySurpriseButton}
                                  disabled={!this.haveLock()}
                                  onClick={() =>
                                    this.setState({ isSurpriseModalOpen: true })
                                  }
                                >
                                  Não sabe o que assistir? ✦ Me surpreenda
                                </button>
                              </div>
                            )}
                          {!this.state.loading &&
                            this.state.nonPlayableMedia && (
                              <Alert
                                color="red"
                                title="Esse link não parece um arquivo de mídia"
                              >
                                Use um link direto de mídia (MP4, M3U8, YouTube)
                                ou compartilhe tela.
                              </Alert>
                            )}
                        </div>
                      )}
                    <iframe
                      style={{
                        display:
                          this.usingYoutube() && !this.state.loading
                            ? "block"
                            : "none",
                      }}
                      title="YouTube"
                      id="leftYt"
                      className={styles.videoContent}
                      allowFullScreen
                      frameBorder="0"
                      allow="autoplay"
                      src="https://www.youtube.com/embed/?enablejsapi=1&controls=0&rel=0&playsinline=1&vq=hd1080"
                    />
                    {this.playingVBrowser() &&
                    this.getVBrowserPass() &&
                    this.getVBrowserHost() ? (
                      <VBrowser
                        username={clientId}
                        password={this.getVBrowserPass()}
                        hostname={this.getVBrowserHost()}
                        controlling={this.state.controller === clientId}
                        resolution={this.state.vBrowserResolution}
                        quality={this.state.vBrowserQuality}
                        doPlay={this.localPlay}
                        setResolution={(data: string) =>
                          this.setState({ vBrowserResolution: data })
                        }
                        setQuality={(data: string) => {
                          this.setState({ vBrowserQuality: data });
                        }}
                        isMobile={isMobile()}
                        openUrl={this.getVBrowserLaunchUrl()}
                      />
                    ) : (
                      <video
                        style={{
                          display:
                            (this.usingNative() && !this.state.loading) ||
                            this.state.fullScreen
                              ? "block"
                              : "none",
                          width: "100%",
                          maxHeight: VIDEO_MAX_HEIGHT_CSS,
                        }}
                        id="leftVideo"
                        onEnded={(e) => this.onVideoEnded(e.currentTarget.src)}
                        playsInline
                        onClick={this.roomTogglePlay}
                      ></video>
                    )}
                    {Boolean(this.state.total) && (
                      <div className={styles.downloadStats}>
                        {Math.min(
                          (this.state.downloaded / this.state.total) * 100,
                          100,
                        ).toFixed(2) +
                          "% - " +
                          formatSpeed(this.state.speed) +
                          " - " +
                          this.state.connections +
                          " conexões"}
                      </div>
                    )}
                  </div>
                  <div className={styles.chatDock}>
                    {!this.state.showChatColumn && (
                      <div className={styles.chatToggleWrap}>
                        <ActionIcon
                          data-testid="open-chat-button"
                          className={styles.chatToggle}
                          size="xl"
                          onClick={() =>
                            this.setState(() => {
                              window.localStorage.setItem(
                                "watchparty-showchatcolumn",
                                "1",
                              );
                              return {
                                showChatColumn: true,
                                showPeopleColumn: false,
                                unreadCount: 0,
                              };
                            })
                          }
                          title="Abrir chat"
                          aria-label="Abrir chat"
                        >
                          <IconMessageCircle size={20} />
                        </ActionIcon>
                        {this.state.unreadCount > 0 && (
                          <div
                            className={styles.chatUnreadBadge}
                            aria-label={unreadAriaLabel}
                            title={unreadAriaLabel}
                          >
                            {unreadBadgeLabel}
                          </div>
                        )}
                      </div>
                    )}
                    <div
                      data-testid="chat-panel"
                      className={`${styles.chatPanel} ${
                        !this.state.showChatColumn ? styles.chatPanelClosed : ""
                      }`}
                    >
                      <div className={styles.chatPanelHeader}>
                        <div className={styles.chatPanelTabs}>
                          <button
                            type="button"
                            className={`${styles.chatPanelTab} ${
                              !this.state.showPeopleColumn
                                ? styles.chatPanelTabActive
                                : ""
                            }`}
                            onClick={() =>
                              this.setState({
                                showPeopleColumn: false,
                                unreadCount: 0,
                              })
                            }
                          >
                            Chat
                          </button>
                          <button
                            type="button"
                            className={`${styles.chatPanelTab} ${
                              this.state.showPeopleColumn
                                ? styles.chatPanelTabActive
                                : ""
                            }`}
                            onClick={() =>
                              this.setState({
                                showPeopleColumn: true,
                              })
                            }
                          >
                            Pessoas
                          </button>
                        </div>
                        <div className={styles.chatPanelActions}>
                          <ActionIcon
                            data-testid="close-chat-button"
                            variant="subtle"
                            color="gray"
                            onClick={() =>
                              this.setState(
                                {
                                  showChatColumn: false,
                                  showPeopleColumn: false,
                                },
                                () => {
                                  window.localStorage.setItem(
                                    "watchparty-showchatcolumn",
                                    "0",
                                  );
                                },
                              )
                            }
                            title="Fechar chat"
                            aria-label="Fechar chat"
                          >
                            <IconX size={16} />
                          </ActionIcon>
                        </div>
                      </div>
                      <div className={styles.chatPanelBody}>
                        {this.state.showPeopleColumn ? (
                          <VideoChat
                            socket={this.socket}
                            participants={this.state.participants}
                            nameMap={this.state.nameMap}
                            nameColorMap={this.state.nameColorMap}
                            pictureMap={this.state.pictureMap}
                            tsMap={this.state.tsMap}
                            rosterUpdateTS={this.state.rosterUpdateTS}
                            owner={this.state.owner}
                            getLeaderTime={this.getLeaderTime}
                          />
                        ) : (
                          <Chat
                            chat={this.state.chat}
                            nameMap={this.state.nameMap}
                            nameColorMap={this.state.nameColorMap}
                            pictureMap={this.state.pictureMap}
                            socket={this.socket}
                            scrollTimestamp={this.state.scrollTimestamp}
                            getMediaDisplayName={this.getMediaDisplayName}
                            isChatDisabled={this.state.isChatDisabled}
                            owner={this.state.owner}
                            ref={this.chatRef}
                            hide={!this.state.showChatColumn}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  {this.state.roomMedia && (
                    <div className={styles.controlsDock}>{controls}</div>
                  )}
                  {Boolean(this.state.roomMedia && !this.state.roomPaused) && (
                    <div className={styles.liveReactionDock}>
                      <div
                        className={styles.liveReactionHoverZone}
                        onMouseEnter={() => this.showLiveReactionTray()}
                        onMouseMove={() => this.showLiveReactionTray()}
                        onMouseLeave={() => this.hideLiveReactionTray()}
                        onTouchStart={() => this.showLiveReactionTray(2600)}
                      />
                      <button
                        type="button"
                        className={styles.liveReactionToggle}
                        onClick={this.toggleLiveReactionTrayMobile}
                        aria-label="Mostrar reações"
                        title="Mostrar reações"
                      >
                        <IconMoodSmile size={18} />
                      </button>
                      <div
                        className={`${styles.liveReactionTray} ${
                          this.state.showLiveReactionTray
                            ? styles.liveReactionTrayVisible
                            : ""
                        }`}
                      >
                        {LIVE_REACTION_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className={styles.liveReactionButton}
                            onClick={() => this.sendLiveReaction(emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <div className={styles.liveReactionLayer} aria-hidden="true">
                        {this.state.liveReactions.map((reaction) => (
                          <div
                            key={reaction.id}
                            className={styles.liveReactionBubble}
                            style={{ left: `${reaction.x}%` }}
                          >
                            {reaction.emoji}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        }
      </React.Fragment>
    );
  }
}

