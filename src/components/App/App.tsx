import type MediasoupClient from "mediasoup-client";
import React from "react";
import { Alert, Loader, Menu, Overlay, Title } from "@mantine/core";
import io, { Socket } from "socket.io-client";
import {
  formatSpeed,
  iceServers,
  isMobile,
  serverPath,
  testAutoplay,
  openFileSelector,
  getColorForStringHex,
  getDefaultPicture,
  getOrCreateClientId,
  getOrCreateSessionId,
  calculateMedian,
  isYouTube,
  isMagnet,
  isHttp,
  isHls,
  isScreenShare,
  isFileShare,
  isDash,
  VIDEO_MAX_HEIGHT_CSS,
  createUuid,
  getSavedPasswords,
} from "../../utils/utils";
import { Chat } from "../Chat/Chat";
import { TopBar } from "../TopBar/TopBar";
import { getCurrentSettings } from "../Settings/LocalSettings";
import { ComboBox } from "../ComboBox/ComboBox";
import { Controls } from "../Controls/Controls";
import { ErrorModal } from "../Modal/ErrorModal";
import { PasswordModal } from "../Modal/PasswordModal";
import { ScreenShareModal } from "../Modal/ScreenShareModal";
import { FileShareModal } from "../Modal/FileShareModal";
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
  IconScreenShare,
  IconSettings,
  IconUser,
  IconVolume,
  IconX,
} from "@tabler/icons-react";
import { InviteButton } from "../InviteButton/InviteButton";
import { isTouchLayout } from "../../utils/touchLayout";
import { t } from "../../i18n";
import type WebTorrent from "webtorrent";
import type Hls from "hls.js";
import { type MediaPlayerClass } from "dashjs";
import { type Torrent } from "webtorrent";
import {
  DEFAULT_CHAT_NAME,
  getDisplayInitials,
  getReadableNameColor,
  normalizeDisplayName,
  normalizeNameColor,
  normalizeYouTubeQuality,
  isPlaybackJump,
  toRgba,
  type YouTubeQualityMode,
} from "./helpers";
import type {
  ShareContentHint,
  ShareQualityMode,
  ShareQualityProfile,
} from "./screenshare/types";
import {
  applyVideoCodecPreferences,
  evaluateCpuSample,
  evaluateNetworkSample,
  getAdaptiveProfile,
  getSenderEncoding,
  getShareContentHint,
  getShareQualityLabel,
  getShareQualityProfile,
  getViewerSenderProfile,
  normalizeShareQualityMode,
  qualityFromScale,
  scaleResolutionToTarget,
  targetEncodeHeight,
} from "./screenshare/quality";
import {
  DISCONNECTED_VIEWER_GRACE_MS,
  ICE_RESTART_RETRY_MS,
  MAX_RECREATE_ATTEMPTS,
  iceRestartDelay,
  recreateDelay,
  sanitizeOfferSdp,
  viewerConnectionReplaced,
} from "./screenshare/reconnect";
import {
  accumulateRtcReport,
  computeBitrateKbps,
  emptyRtcStatsSummary,
} from "./screenshare/rtcStats";
import { AudioLevelMeter } from "./screenshare/audioMeter";
import {
  collectRemoteShareTracks,
  needsRemoteShareReattach,
  remoteAudioLooksStalled,
  shareAudioNeedsResync,
  shareVideoNeedsResync,
} from "./screenshare/remoteStream";
import { tracksToPublish } from "./screenshare/publish";
import {
  displayMediaConstraintRejected,
  getDisplayMediaRequest,
  getScreenShareMode,
  isHandheldShareDevice,
  limitShareProfileForDevice,
  readShareCaptureEnv,
  screenShareUnsupportedMessage,
} from "./screenshare/capture";
import { tuneOpusFmtp } from "./screenshare/opus";
import {
  shouldRefreshTurnCredential,
  turnRefreshDelayMs,
} from "./screenshare/turn";

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
const YOUTUBE_QUALITY_STORAGE_KEY = "watchparty-yt-quality";
const NAME_COLOR_STORAGE_KEY = "watchparty-name-color";

const SettingsModal = React.lazy(() =>
  import("../Settings/SettingsModal").then((mod) => ({
    default: mod.SettingsModal,
  })),
);
const SurpriseModal = React.lazy(() =>
  import("../Modal/SurpriseModal").then((mod) => ({
    default: mod.SurpriseModal,
  })),
);
const MultiStreamModal = React.lazy(() =>
  import("../Modal/MultiStreamModal").then((mod) => ({
    default: mod.MultiStreamModal,
  })),
);
const debugLog = (...args: unknown[]) => {
  if (config.NODE_ENV === "development") {
    console.log(...args);
  }
};

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
  nonPlayableMedia: boolean;
  currentTab: string;
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
  youtubeCaptionsEnabled: boolean;
  soundPromptMedia: string;
  playbackNeedsGesture: boolean;
  joinToasts: JoinToast[];
  countdownVisible: boolean;
  countdownText: string;
  countdownInProgress: boolean;
  connectionQuality: "idle" | "good" | "adjusting" | "poor" | "reconnecting";
  shareAudioMissing: boolean;
}

type JoinToast = {
  id: string;
  userId: string;
  name: string;
  color: string;
  initials: string;
};

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
    isAutoPlayable: true,
    downloaded: 0,
    total: 0,
    speed: 0,
    connections: 0,
    fileSelection: [],
    overlayMsg: "",
    isErrorAuth: false,
    settings: {},
    nonPlayableMedia: false,
    currentTab:
      new URLSearchParams(window.location.search).get("tab") ?? "chat",
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
    showChatColumn: isTouchLayout()
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
    youtubeCaptionsEnabled: false,
    soundPromptMedia: "",
    playbackNeedsGesture: false,
    joinToasts: [],
    countdownVisible: false,
    countdownText: "",
    countdownInProgress: false,
    connectionQuality: "idle",
    shareAudioMissing: false,
  };
  socket: Socket = null!;
  mediasoupPubSocket: Socket | null = null;
  mediasoupSubSocket: Socket | null = null;
  ytDebounce = true;
  observedMediaTime = 0;
  observedAt = 0;
  suppressSeekPublishUntil = 0;
  youtubePauseTimer: number | undefined = undefined;
  playbackGestureTimer: number | undefined = undefined;
  soundUnlockedMedia = "";
  youtubeStartByMe = false;
  youtubeStartUrl = "";
  youtubeStartTimer: number | undefined = undefined;
  youtubeSoundUnlocked = false;
  localStreamToPublish?: MediaStream;
  isLocalStreamAFile = false;
  localFileObjectUrl: string | undefined = undefined;
  publisherConns: PCDict = {};
  pendingIceCandidates = new WeakMap<
    RTCPeerConnection,
    RTCIceCandidateInit[]
  >();
  rtcRecovery = new WeakMap<
    RTCPeerConnection,
    { timer?: number; attempts: number }
  >();
  pendingIceRestart = new WeakSet<RTCPeerConnection>();
  consumerRecreateAttempts = 0;
  consumerRecreateTimer: number | undefined = undefined;
  publisherRecreateAttempts: Record<string, number> = {};
  publisherRecreateTimers: Record<string, number> = {};
  publisherNeedsReset = new Set<string>();
  lastResyncByViewer: Record<string, number> = {};
  audioResyncRequests = 0;
  // Latest RTC stats snapshot. Kept off React state: it is not rendered, and
  // a setState every 2s would re-render this very large component for nothing.
  mediaHealth?: MediaHealth;
  shareContentHintOverride?: ShareContentHint;
  audioMeter = new AudioLevelMeter();
  audioMeterFill = React.createRef<HTMLDivElement>();
  audioCheckTimer: number | undefined = undefined;
  shareReclaimTimes: number[] = [];
  lastAppliedShareProfileKey = "";
  viewerShareQualityMap: Record<string, ShareQualityMode> = {};
  viewerEpoch: Record<string, number> = {};
  negotiationQueued = new WeakSet<RTCPeerConnection>();
  negotiationHooked = new WeakSet<RTCPeerConnection>();
  shareTrackWatcher?: MediaStream;
  lastShareCaptureHeight = 0;
  audioCheckGeneration = 0;
  consumerConn?: RTCPeerConnection;
  remoteShareStream?: MediaStream;
  remoteShareAttachedIds = new Set<string>();
  soundVerifyTimer: number | undefined = undefined;
  progressUpdater?: number;
  heartbeat: number | undefined = undefined;
  syncUpdater: number | undefined = undefined;
  rtcStatsUpdater: number | undefined = undefined;
  shareNetworkScale = 1;
  stableRtcSamples = 0;
  constrainedRtcSamples = 0;
  // Sender CPU pressure (qualityLimitationReason "cpu"), see evaluateCpuSample.
  shareCpuConstrained = false;
  cpuLimitedRtcSamples = 0;
  cpuCleanRtcSamples = 0;
  turnIceServers?: RTCIceServer[];
  turnCredentialExpiresAt = 0;
  turnRefreshTimer: number | undefined = undefined;
  turnCredentialLoading = false;
  turnEndpointUnavailable = false;
  lastRtcBytesSent = 0;
  lastRtcStatsTimestamp = 0;
  warningMessageTimeout: number | undefined = undefined;
  errorMessageTimeout: number | undefined = undefined;
  successMessageTimeout: number | undefined = undefined;
  joinToastTimeouts = new Map<string, number>();
  countdownTimeouts: number[] = [];
  suppressYouTubeStateSyncUntil = 0;
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
    const leftVideo = document.getElementById(
      "leftVideo",
    ) as HTMLVideoElement | null;
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
    document.addEventListener("visibilitychange", this.onDocumentVisible);

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
    void this.loadTurnCredentials();
    this.loadYouTube();
    this.init();
    this.rtcStatsUpdater = window.setInterval(
      () => void this.updateRtcHealth(),
      2000,
    );
  }

  componentWillUnmount() {
    document.removeEventListener("fullscreenchange", this.onFullScreenChange);
    document.removeEventListener("keydown", this.onKeydown);
    const leftVideo = document.getElementById(
      "leftVideo",
    ) as HTMLVideoElement | null;
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
    document.removeEventListener("visibilitychange", this.onDocumentVisible);
    window.clearTimeout(this.turnRefreshTimer);
    window.clearInterval(this.heartbeat);
    window.clearInterval(this.progressUpdater);
    window.clearInterval(this.syncUpdater);
    window.clearInterval(this.rtcStatsUpdater);
    window.clearTimeout(this.warningMessageTimeout);
    window.clearTimeout(this.youtubePauseTimer);
    window.clearTimeout(this.playbackGestureTimer);
    window.clearTimeout(this.youtubeStartTimer);
    this.joinToastTimeouts.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    this.joinToastTimeouts.clear();
    this.clearCountdownTimers();
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

  onDocumentVisible = () => {
    if (
      document.visibilityState !== "visible" ||
      this.turnEndpointUnavailable
    ) {
      return;
    }
    if (
      shouldRefreshTurnCredential(this.turnCredentialExpiresAt, Date.now())
    ) {
      void this.loadTurnCredentials();
    }
  };

  loadTurnCredentials = async () => {
    if (this.turnCredentialLoading) {
      return;
    }
    this.turnCredentialLoading = true;
    window.clearTimeout(this.turnRefreshTimer);
    try {
      const response = await fetch(`${serverPath}/webrtc/ice`, {
        cache: "no-store",
      });
      if (response.status === 204) {
        this.turnEndpointUnavailable = true;
        return;
      }
      if (!response.ok) {
        throw new Error(`ice ${response.status}`);
      }
      const data = (await response.json()) as {
        iceServers?: RTCIceServer[];
        ttlSeconds?: number;
      };
      if (!Array.isArray(data.iceServers) || !data.iceServers.length) {
        this.turnEndpointUnavailable = true;
        return;
      }
      this.turnEndpointUnavailable = false;
      this.turnIceServers = data.iceServers;
      const ttlSeconds = Number(data.ttlSeconds);
      const ttl =
        Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 21_600;
      this.turnCredentialExpiresAt = Date.now() + ttl * 1000;
      this.turnRefreshTimer = window.setTimeout(() => {
        void this.loadTurnCredentials();
      }, turnRefreshDelayMs(ttl));
      const connections = [
        ...Object.values(this.publisherConns),
        ...(this.consumerConn ? [this.consumerConn] : []),
      ];
      connections.forEach((pc) => {
        try {
          pc.setConfiguration({ iceServers: this.turnIceServers });
        } catch {
          // A connection can be closed while the credential request completes.
        }
      });
    } catch {
      // TURN is optional. Static VITE_TURN_* settings remain a fallback.
      // Near expiry, try again so a blip does not end a long relay session.
      if (
        shouldRefreshTurnCredential(this.turnCredentialExpiresAt, Date.now())
      ) {
        this.turnRefreshTimer = window.setTimeout(() => {
          void this.loadTurnCredentials();
        }, turnRefreshDelayMs(0));
      }
    } finally {
      this.turnCredentialLoading = false;
    }
  };

  getRtcConfiguration = (): RTCConfiguration => ({
    iceServers: this.turnIceServers ?? iceServers(),
  });

  showWarningMessage = (warningMessage: string, durationMs = 3000) => {
    window.clearTimeout(this.warningMessageTimeout);
    this.setState({ warningMessage });
    this.warningMessageTimeout = window.setTimeout(() => {
      this.setState({ warningMessage: "" });
    }, durationMs);
  };

  onProfileUpdated = (
    event: CustomEvent<{ name?: string; avatar?: string }>,
  ) => {
    const newName = String(event.detail?.name ?? "").trim();
    const newAvatar = String(event.detail?.avatar ?? "").trim();
    if (newName) {
      this.updateName(newName, { forceFallback: true });
    }
    if (newAvatar) {
      this.updatePicture(newAvatar);
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
      if (this.usingYoutube()) {
        this.playYouTubeWithRoom(this.youtubeStartByMe);
        return;
      }
      this.localPlay();
    });
    socket.on("REC:pause", () => {
      this.suppressYouTubeStateSyncUntil = Date.now() + 1500;
      this.setState({
        playbackNeedsGesture: false,
        soundPromptMedia:
          this.playingScreenShare() || this.playingFileShare()
            ? this.state.soundPromptMedia
            : "",
      });
      this.localPause();
    });
    socket.on("REC:seek", (data: number) => {
      this.suppressYouTubeStateSyncUntil = Date.now() + 1500;
      this.suppressSeekPublishUntil = Date.now() + 1500;
      this.observedMediaTime = data;
      this.observedAt = Date.now();
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
      this.suppressYouTubeStateSyncUntil = Date.now() + 2500;
      const startedHere =
        this.youtubeStartByMe && currentMedia === this.youtubeStartUrl;
      if (currentMedia !== this.youtubeStartUrl) {
        this.youtubeSoundUnlocked = false;
      }
      if (
        currentMedia === "" &&
        this.playingScreenShare() &&
        this.reclaimScreenShare()
      ) {
        return;
      }
      if (this.playingScreenShare() && !isScreenShare(currentMedia)) {
        this.stopPublishingLocalStream();
      }
      if (this.playingFileShare() && !isFileShare(currentMedia)) {
        this.stopPublishingLocalStream();
      }
      if (this.playingScreenShare() && isScreenShare(currentMedia)) {
        // Ignore, it's probably a reconnection
        return;
      }
      if (this.playingFileShare() && isFileShare(currentMedia)) {
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
          controller: data.controller,
          isLiveStream: false,
          playbackNeedsGesture:
            Boolean(currentMedia) &&
            isYouTube(currentMedia) &&
            !data.paused &&
            !startedHere,
          soundPromptMedia: "",
        },
        async () => {
          this.soundUnlockedMedia = "";
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

          if (this.playingScreenShare() || this.playingFileShare()) {
            debugLog(
              "exiting REC:host since we are using webRTC (fileshare or screenshare). Check setupRTCConnections()",
            );
            this.setLoadingFalse();
            // F5 destroys the capture. If this tab still owns the room share
            // but has nothing to publish, drop it so viewers are not stuck
            // on a silent, empty connection. A live tab still has the stream
            // and keeps the share across a Socket.IO reconnect.
            if (
              !this.localStreamToPublish &&
              currentMedia.includes(getOrCreateClientId())
            ) {
              this.socket.emit("CMD:leaveScreenShare");
              this.setState({
                roomMedia: "",
                loading: false,
                soundPromptMedia: "",
              });
              return;
            }
            if (this.playingScreenShare() || this.playingFileShare()) {
              await this.setupRTCConnections();
            }
            this.armShareSoundPrompt();
            return;
          }
          if (this.usingYoutube() && !this.YouTubeInterface.isReady()) {
            debugLog(
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
                errorMessage: "Links magnet estao desativados neste ambiente.",
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
                debugLog("Client is downloading:", torrent.infoHash);

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
                debugLog("DASH stream initialized: isLive %s", isLiveStream);
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
                debugLog("HLS level loaded: isLive %s", isLiveStream);
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
          // Start this video. The person who picked it has a click gesture, so
          // their YouTube can play with sound. Everyone else is muted until
          // they tap — otherwise the browser leaves them on the poster.
          if (this.usingYoutube() && (startedHere || !data.paused)) {
            this.playYouTubeWithRoom(startedHere);
            if (startedHere) {
              this.suppressYouTubeStateSyncUntil = Date.now() + 1500;
              this.socket.emit("CMD:play");
            }
          } else if (!data.paused) {
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
                debugLog("setting playback rate again", data.playbackRate);
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
          // debugLog(delta, pbr);
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
        msg: { ice: any; sdp: any; reset?: boolean; resync?: boolean; reason?: string };
        from: string;
        sharer: boolean;
      }) => {
        config.NODE_ENV === "development" && debugLog(data);
        // Handle messages received from signaling server
        const msg = data.msg;
        const from = data.from;
        if (msg.reset && data.sharer) {
          // The sharer rebuilt its side: rebuild ours so the new offer lands
          // on a fresh connection instead of a stale DTLS/ICE session.
          this.resetConsumerConnection(from);
          return;
        }
        if (msg.resync && !data.sharer) {
          this.handleResyncRequest(from, msg.reason);
          return;
        }
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
        try {
          if (msg.ice !== undefined) {
            await this.addRemoteIceCandidate(pc, msg.ice);
          } else if (msg.sdp && msg.sdp.type === "offer") {
            // debugLog('offer');
            // TODO Currently ios/Safari cannot handle this property, so remove it from the offer
            const _sdp = sanitizeOfferSdp(msg.sdp.sdp);
            msg.sdp.sdp = _sdp;
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            await this.flushPendingIceCandidates(pc);
            // Tune only the fmtp of the already negotiated opus/48000/2
            // payload (stereo, FEC, DTX off, ~128 kbps). The remote offer is
            // left alone, and the codec is never renamed to multiopus: that
            // rewrite muted mobile Chromium.
            const answer = await pc.createAnswer();
            await pc.setLocalDescription({
              type: answer.type,
              sdp: tuneOpusFmtp(answer.sdp ?? ""),
            });
            this.sendSignalSS(from, { sdp: pc.localDescription }, !data.sharer);
          } else if (msg.sdp && msg.sdp.type === "answer") {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            await this.flushPendingIceCandidates(pc);
          }
        } catch (e) {
          console.warn("[signalSS] falha ao processar sinalização", e);
          if (data.sharer && msg.sdp?.type === "offer") {
            // We could not apply the sharer's offer; ask for a fresh start.
            this.requestSharerResync(from, "failed");
          }
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
        this.viewerShareQualityMap[viewerId] = normalizeShareQualityMode(
          data?.mode,
        );
        void this.applyAdaptiveShareQuality();
      },
    );
    window.clearInterval(this.syncUpdater);
    this.syncUpdater = window.setInterval(() => {
      if (
        !this.state.roomMedia ||
        document.visibilityState !== "visible" ||
        this.state.participants.length < 2
      ) {
        return;
      }
      const current = this.Player().getCurrentTime();
      const elapsed = (Date.now() - this.observedAt) / 1000;
      const rate = this.state.roomPaused
        ? 0
        : this.Player().getPlaybackRate() || 1;
      if (
        this.observedAt > 0 &&
        Date.now() >= this.suppressSeekPublishUntil &&
        this.haveLock() &&
        !this.playingScreenShare() &&
        !this.playingFileShare() &&
        !this.state.isLiveStream &&
        isPlaybackJump(this.observedMediaTime, current, elapsed, rate)
      ) {
        this.publishSeek(current);
      }
      this.observedMediaTime = current;
      this.observedAt = Date.now();
      if (!this.state.roomPaused && Date.now() >= this.suppressSeekPublishUntil) {
        this.socket.emit("CMD:ts", this.getRoomTSToSet(current));
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
          cc_load_policy: 0,
          iv_load_policy: 3,
        },
        events: {
          onReady: () => {
            debugLog("yt onReady");
            this.YouTubeInterface = new YouTube(
              ytPlayer,
              this.state.youtubeQualityMode,
            );
            this.YouTubeInterface.setCaptionsEnabled(
              this.state.youtubeCaptionsEnabled,
            );
            this.applyYouTubeQualityPreference();
            this.setState({ loading: false });
            // We might have failed to play YT originally, ask for the current video again
            if (this.usingYoutube()) {
              debugLog("requesting host data again after ytReady");
              this.socket.emit("CMD:askHost");
            }
          },
          onApiChange: () => {
            this.YouTubeInterface?.setCaptionsEnabled(
              this.state.youtubeCaptionsEnabled,
            );
          },
          onStateChange: (e) => {
            if (
              this.usingYoutube() &&
              e.data === window.YT?.PlayerState?.CUED
            ) {
              this.applyYouTubeQualityPreference();
              this.YouTubeInterface.applyCaptionsPreference();
              this.setState({ loading: false });
            }
            if (
              this.usingYoutube() &&
              (e.data === window.YT?.PlayerState?.PLAYING ||
                e.data === window.YT?.PlayerState?.BUFFERING)
            ) {
              window.clearTimeout(this.youtubePauseTimer);
              this.refreshYouTubeQualityLevels();
              this.YouTubeInterface.applyCaptionsPreference();
            }
            if (
              this.usingYoutube() &&
              e.data === window.YT?.PlayerState?.ENDED
            ) {
              debugLog(e.data, e.target.getVideoUrl());
              this.onVideoEnded(e.target.getVideoUrl());
            }
            if (
              this.usingYoutube() &&
              e.data === window.YT?.PlayerState?.PLAYING
            ) {
              window.clearTimeout(this.youtubePauseTimer);
              const needsSound =
                !this.youtubeStartByMe &&
                !this.youtubeSoundUnlocked &&
                this.YouTubeInterface.isMuted();
              this.setState({
                playbackNeedsGesture: false,
                roomPaused: false,
                soundPromptMedia: needsSound ? this.state.roomMedia : "",
              });
              if (
                this.ytDebounce &&
                Date.now() >= this.suppressYouTubeStateSyncUntil &&
                this.state.roomPaused &&
                this.haveLock()
              ) {
                this.ytDebounce = false;
                this.socket.emit("CMD:play");
                window.setTimeout(() => (this.ytDebounce = true), 500);
              }
            }
            if (
              this.usingYoutube() &&
              e.data === window.YT?.PlayerState?.PAUSED
            ) {
              window.clearTimeout(this.youtubePauseTimer);
              this.youtubePauseTimer = window.setTimeout(() => {
                if (
                  !this.ytDebounce ||
                  Date.now() < this.suppressYouTubeStateSyncUntil ||
                  this.state.roomPaused ||
                  !this.haveLock() ||
                  !this.usingYoutube()
                ) {
                  return;
                }
                const state =
                  this.YouTubeInterface.watchPartyYTPlayer?.getPlayerState();
                if (state !== window.YT?.PlayerState?.PAUSED) {
                  return;
                }
                this.ytDebounce = false;
                this.socket.emit("CMD:pause");
                this.setState({ roomPaused: true });
                window.setTimeout(() => (this.ytDebounce = true), 500);
              }, 450);
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
    return clientId === this.state.roomLock;
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
    const files = await openFileSelector(
      "video/*,.mkv,.webm,.mp4,.m4v,.mov,.avi",
    );
    if (!files || files.length === 0) {
      return;
    }
    const file = files[0];
    const leftVideo =
      this.HTMLInterface.getVideoEl() as HTMLVideoElement | null;
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

  // The server clears an ephemeral share when the sharer's socket drops (slow
  // internet). If our capture is still alive, claim the share again instead of
  // forcing the user to share the screen from scratch.
  reclaimScreenShare = (): boolean => {
    const stream = this.localStreamToPublish;
    if (
      !stream ||
      this.isLocalStreamAFile ||
      this.state.roomMedia.includes("@") ||
      !this.socket?.connected
    ) {
      return false;
    }
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState !== "live") {
      return false;
    }
    const now = Date.now();
    this.shareReclaimTimes = this.shareReclaimTimes.filter(
      (t) => now - t < 60_000,
    );
    if (this.shareReclaimTimes.length >= 3) {
      return false;
    }
    this.shareReclaimTimes.push(now);
    Object.entries(this.publisherConns).forEach(([id, pc]) => {
      this.releasePublisher(pc);
      this.publisherNeedsReset.add(id);
    });
    this.publisherConns = {};
    this.viewerEpoch = {};
    if (this.consumerConn) {
      this.consumerConn.onconnectionstatechange = null;
      try {
        this.consumerConn.close();
      } catch {
        // already closed
      }
      this.consumerConn = undefined;
      this.remoteShareStream = undefined;
    }
    this.socket.emit("CMD:joinScreenShare", { file: false, mediasoup: false });
    return true;
  };

  getActiveShareViewerCount = () => {
    const selfId = getOrCreateClientId();
    return Math.max(
      1,
      this.state.participants.filter((p) => p.id !== selfId).length,
    );
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
    const normalized = normalizeShareQualityMode(mode);
    this.setState({ screenShareQualityMode: normalized }, () => {
      window.localStorage.setItem("watchparty-ss-quality", normalized);
      this.emitViewerShareQualityPreference();
    });
  };

  applyShareSenderQuality = async (
    viewerId: string,
    sender: RTCRtpSender,
    baseProfile: ShareQualityProfile,
  ) => {
    if (!sender.track || sender.track.kind !== "video") {
      return;
    }
    const mode = normalizeShareQualityMode(
      this.viewerShareQualityMap[viewerId] ?? "auto",
    );
    const profile = getViewerSenderProfile(baseProfile, mode);
    try {
      const params = sender.getParameters() as RTCRtpSendParameters & {
        degradationPreference?: RTCDegradationPreference;
      };
      const encodings =
        params.encodings && params.encodings.length > 0
          ? params.encodings
          : [{} as RTCRtpEncodingParameters];
      const contentHint: ShareContentHint =
        sender.track.contentHint === "detail" ? "detail" : "motion";
      const encoding = getSenderEncoding(
        profile,
        this.shareNetworkScale,
        contentHint,
        this.shareCpuConstrained,
      );
      const senderHeight = Number(sender.track.getSettings?.().height) || 0;
      const sourceHeight =
        Number(
          this.localStreamToPublish?.getVideoTracks()[0]?.getSettings?.()
            .height,
        ) || 0;
      // The sender track is a clone. Some browsers only report the real
      // frame size on the original capture track.
      const captureHeight = senderHeight || sourceHeight;
      const targetHeight = targetEncodeHeight(baseProfile, mode);
      encodings[0] = {
        ...encodings[0],
        maxBitrate: encoding.maxBitrate,
        maxFramerate: encoding.maxFramerate,
        // Scale the real captured frame down to the target. A 1440p/4K
        // surface encoded at the 1080p bitrate cap is what looked blurry
        // on both sides. Never stack this on top of a network downscale.
        scaleResolutionDownBy: scaleResolutionToTarget(
          captureHeight || targetHeight,
          targetHeight,
        ),
      };
      params.encodings = encodings;
      // Hold resolution while the link/CPU are healthy; "balanced" only under
      // measured pressure (see getDegradationPreference in quality.ts).
      params.degradationPreference = encoding.degradationPreference;
      await sender.setParameters(params);
    } catch (e) {
      console.warn("screenshare: failed to apply sender parameters", e);
    }
  };

  // The quality label is no longer rendered, but the state is kept. Only touch
  // React when the value really changes, so the 2s stats poll does not
  // re-render the whole component.
  setConnectionQuality = (connectionQuality: AppState["connectionQuality"]) => {
    if (this.state.connectionQuality !== connectionQuality) {
      this.setState({ connectionQuality });
    }
  };

  updateRtcHealth = async () => {
    const connections = [
      ...Object.values(this.publisherConns),
      ...(this.consumerConn ? [this.consumerConn] : []),
    ].filter((pc) => pc.connectionState !== "closed");
    if (!connections.length) {
      this.mediaHealth = undefined;
      this.setConnectionQuality("idle");
      return;
    }

    const summary = emptyRtcStatsSummary();
    // Loss/RTT from a viewer who just hit F5 is a dead receiver, not a
    // weak link. Counting it used to ratchet every peer down to a soft
    // picture. Only connected remote publishers vote on bitrate.
    const remoteLoss = emptyRtcStatsSummary();
    const selfId = getOrCreateClientId();
    let remoteReconnecting = false;
    for (const pc of connections) {
      const remotePublisher = Object.entries(this.publisherConns).some(
        ([id, candidate]) => candidate === pc && id !== selfId,
      );
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected" ||
        pc.connectionState === "connecting"
      ) {
        // Recovery (ICE restart / recreation) is driven by
        // watchPeerConnection, which owns the backoff timers.
        this.setConnectionQuality("reconnecting");
        if (remotePublisher) {
          remoteReconnecting = true;
        }
      }
      const stats = await pc.getStats();
      stats.forEach((report: any) => {
        accumulateRtcReport(summary, report);
        if (remotePublisher && pc.connectionState === "connected") {
          accumulateRtcReport(remoteLoss, report);
        }
      });
    }
    const { totalBytesSent, videoWidth, videoHeight, framesPerSecond, transport, cpuLimited } =
      summary;
    const worstLoss = remoteLoss.worstLoss;
    const worstRtt = remoteLoss.worstRtt;

    const now = Date.now();
    const elapsedSeconds = (now - this.lastRtcStatsTimestamp) / 1000;
    const bitrateKbps = computeBitrateKbps(
      totalBytesSent,
      this.lastRtcBytesSent,
      elapsedSeconds,
      Boolean(this.lastRtcStatsTimestamp),
    );
    this.lastRtcBytesSent = totalBytesSent;
    this.lastRtcStatsTimestamp = now;
    const remoteAudioTrack = (
      this.HTMLInterface.getVideoEl()?.srcObject as MediaStream | null
    )
      ?.getAudioTracks()
      .find((track) => track.readyState === "live");
    this.mediaHealth = {
      videoWidth,
      videoHeight,
      framesPerSecond: Math.round(framesPerSecond),
      bitrateKbps,
      packetLossPercent: Number((worstLoss * 100).toFixed(1)),
      roundTripMs: Math.round(worstRtt * 1000),
      transport,
      audioTrack: remoteAudioTrack
        ? "active"
        : this.playingScreenShare() || this.playingFileShare()
          ? "missing"
          : "blocked",
    };

    await this.noteShareCaptureHeight();
    if (remoteReconnecting) {
      // Keep the byte counters fresh, but do not treat the refresh gap as
      // congestion. Resolution and bitrate stay where they were.
      this.setConnectionQuality("reconnecting");
      return;
    }

    // Browsers report "bandwidth" as a quality limitation even while a stream
    // is healthy. Treating that flag as a failure caused a permanent downscale
    // to 540p. Adapt bitrate only after measured loss/latency persists.
    const result = evaluateNetworkSample(
      {
        scale: this.shareNetworkScale,
        constrainedSamples: this.constrainedRtcSamples,
        stableSamples: this.stableRtcSamples,
      },
      worstLoss,
      worstRtt,
    );
    this.shareNetworkScale = result.scale;
    this.constrainedRtcSamples = result.constrainedSamples;
    this.stableRtcSamples = result.stableSamples;
    // Record CPU pressure, but do not let it change the encode. Switching to
    // "balanced" shrunk the picture for both peers and it stayed shrunk.
    const cpu = evaluateCpuSample(
      {
        constrained: this.shareCpuConstrained,
        limitedSamples: this.cpuLimitedRtcSamples,
        cleanSamples: this.cpuCleanRtcSamples,
      },
      cpuLimited,
    );
    this.shareCpuConstrained = cpu.constrained;
    this.cpuLimitedRtcSamples = cpu.limitedSamples;
    this.cpuCleanRtcSamples = cpu.cleanSamples;
    if (result.constrained) {
      if (result.changed) {
        this.setConnectionQuality(result.severe ? "poor" : "adjusting");
        await this.applyAdaptiveShareQuality();
      }
      return;
    }
    if (result.changed) {
      await this.applyAdaptiveShareQuality();
    }
    this.setConnectionQuality(qualityFromScale(this.shareNetworkScale));
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
    const contentHint = getShareContentHint(
      videoTrack,
      this.shareContentHintOverride,
    );
    if (videoTrack.contentHint !== contentHint) {
      videoTrack.contentHint = contentHint;
    }
    const peerCount = this.getActiveShareViewerCount();
    const baseProfile = limitShareProfileForDevice(
      getShareQualityProfile(peerCount),
      isHandheldShareDevice(readShareCaptureEnv()),
    );
    const profile = getAdaptiveProfile(
      baseProfile,
      this.shareNetworkScale,
      contentHint,
    );
    // Do not call applyConstraints on the capture. That restarts the
    // capturer, which drops the audio track on the next renegotiation and
    // can lock in a smaller frame than getDisplayMedia already produced.
    // Sender parameters (bitrate + an explicit scale to the target height)
    // are what adapts.
    Object.values(this.publisherConns).forEach((pc) => {
      pc.getSenders().forEach((sender) => {
        if (
          sender.track?.kind === "video" &&
          sender.track.contentHint !== contentHint
        ) {
          sender.track.contentHint = contentHint;
        }
      });
    });
    const profileKey = `${profile.captureWidth}x${profile.captureHeight}@${profile.maxFramerate}`;
    if (profileKey !== this.lastAppliedShareProfileKey) {
      this.lastAppliedShareProfileKey = profileKey;
      debugLog(
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
    const captureEnv = readShareCaptureEnv();
    const mode = getScreenShareMode(captureEnv);
    const getDisplayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(
      navigator.mediaDevices,
    );
    if (mode === "unsupported" || !getDisplayMedia) {
      this.showWarningMessage(screenShareUnsupportedMessage(captureEnv), 12000);
      return;
    }
    try {
      let stream: MediaStream;
      if (mode === "desktop") {
        try {
          stream = await getDisplayMedia(getDisplayMediaRequest("desktop"));
        } catch (error) {
          // A browser that does not understand systemAudio rejects the
          // request before the picker. Ask again without that hint. A
          // dismissed dialog is not retried.
          if (!displayMediaConstraintRejected(error)) {
            throw error;
          }
          stream = await getDisplayMedia(
            getDisplayMediaRequest("desktop", { systemAudio: false }),
          );
        }
      } else {
        stream = await getDisplayMedia(getDisplayMediaRequest(mode));
      }
      this.localStreamToPublish = stream;
      this.isLocalStreamAFile = false;
      this.watchLocalShareTracks(stream);
      if (stream.getAudioTracks().length === 0) {
        this.showWarningMessage(
          mode === "handheld"
            ? "A tela foi compartilhada sem áudio. No celular e no tablet o navegador não captura o som de outros aplicativos."
            : "A tela foi compartilhada sem áudio. Para transmitir o som, escolha uma aba e marque “Compartilhar áudio”.",
          15000,
        );
      }
      await this.applyAdaptiveShareQuality();
      this.startAudioMeter();
      this.forceUpdate();
      this.socket.emit("CMD:joinScreenShare", {
        file: false,
        mediasoup: useMediaSoup,
      });
    } catch (e: any) {
      const cancelled =
        e?.name === "NotAllowedError" || e?.name === "AbortError";
      if (mode === "handheld") {
        this.showWarningMessage(
          cancelled
            ? "O compartilhamento não começou. Aceite a permissão de gravar a tela quando o sistema pedir."
            : "Não foi possível compartilhar a tela neste aparelho. Atualize o Chrome no Android e aceite gravar a tela.",
          12000,
        );
        return;
      }
      if (!cancelled) {
        this.showWarningMessage(
          "Não foi possível iniciar o compartilhamento de tela.",
        );
      }
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
          debugLog("PUBLISH: connected to socket.io");
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
      debugLog("PUBLISH: --- createProducerTransport --");
      const params = await sendRequest("createProducerTransport", {});
      debugLog("PUBLISH: transport params:", params);
      producerTransport = device.createSendTransport(params);
      debugLog("PUBLISH: createSendTransport:", producerTransport);

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
          debugLog("PUBLISH: --transport connect");
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
          debugLog("PUBLISH: --transport produce");
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
      //       debugLog('PUBLISH: connecting');
      //       break;

      //     case 'connected':
      //       debugLog('PUBLISH: connected');
      //       break;

      //     case 'failed':
      //       debugLog('PUBLISH: failed');
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
    debugLog("PUBLISH: getRouterRtpCapabilities:", data);
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
          debugLog("SUBSCRIBE: connected to socket.io");
          resolve();
        });
        socket?.on("error", function (err) {
          console.error("SUBSCRIBE: socket.io ERROR:", err);
          reject(err);
        });
        socket?.on("newProducer", async function (message) {
          debugLog("SUBSCRIBE: socket.io newProducer:", message);
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
        //   debugLog('socket.io producerClosed:', message);
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
      const video = this.HTMLInterface.getVideoEl();
      // Never addTrack() to the attached stream: Chrome Android may ignore a
      // late audio track. Attach a fresh stream with every live track instead.
      const current = (video?.srcObject as MediaStream | null)?.getTracks();
      this.attachRemoteShareStream(
        collectRemoteShareTracks(current, undefined, track),
      );
      if (track.kind === "audio" && this.state.shareAudioMissing) {
        this.setState({ shareAudioMissing: false });
      }
      void this.localPlay();
    };

    async function consumeAndResume(kind: string) {
      const consumer = await consume(consumerTransport, kind);
      if (consumer) {
        debugLog("SUBSCRIBE: -- track exist, consumer ready. kind=" + kind);
        // Resume both kinds. Servers that create audio consumers unpaused
        // simply ignore it; servers that pause them would otherwise keep the
        // audio consumer silent forever.
        debugLog("SUBSCRIBE: -- resume kind=" + kind);
        sendRequest("resume", { kind: kind })
          .then(() => {
            debugLog("SUBSCRIBE: resume OK kind=" + kind);
          })
          .catch((err) => {
            console.error("SUBSCRIBE: resume ERROR:", kind, err);
          });
        return consumer;
      } else {
        debugLog("SUBSCRIBE: -- no consumer yet. kind=" + kind);
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
      debugLog("SUBSCRIBE: --start of consume --kind=" + trackKind);
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
        debugLog("SUBSCRIBE: --end of consume");
        return consumer;
      } else {
        console.warn("SUBSCRIBE: ---remote producer NOT READY");
        return null;
      }
    }

    async function subscribe() {
      debugLog("SUBSCRIBE: ---createConsumerTransport --");
      const params = await sendRequest("createConsumerTransport", {});
      debugLog("SUBSCRIBE: transport params:", params);
      consumerTransport = device.createRecvTransport(params);
      debugLog("SUBSCRIBE: createConsumerTransport:", consumerTransport);

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
          debugLog("SUBSCRIBE: ---consumer transport connect");
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
      //       debugLog('SUBSCRIBE: connecting');
      //       break;

      //     case 'connected':
      //       debugLog('SUBSCRIBE: connected');
      //       break;

      //     case 'failed':
      //       debugLog('SUBSCRIBE: failed');
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
    debugLog("getRouterRtpCapabilities:", data);
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
    this.stopAudioMeter();
    this.remoteShareStream = undefined;
    if (this.consumerConn) {
      this.consumerConn.close();
      this.consumerConn = undefined;
    }
    Object.values(this.publisherConns).forEach((pc) => {
      this.releasePublisher(pc);
    });
    this.publisherConns = {};
    this.viewerEpoch = {};
    this.shareTrackWatcher = undefined;
    this.lastShareCaptureHeight = 0;
    this.lastAppliedShareProfileKey = "";
    this.lastRtcBytesSent = 0;
    this.lastRtcStatsTimestamp = 0;
    this.constrainedRtcSamples = 0;
    this.stableRtcSamples = 0;
    this.shareNetworkScale = 1;
    this.shareCpuConstrained = false;
    this.cpuLimitedRtcSamples = 0;
    this.cpuCleanRtcSamples = 0;
    window.clearTimeout(this.consumerRecreateTimer);
    window.clearTimeout(this.audioCheckTimer);
    Object.values(this.publisherRecreateTimers).forEach((t) =>
      window.clearTimeout(t),
    );
    this.publisherRecreateTimers = {};
    this.publisherRecreateAttempts = {};
    this.publisherNeedsReset.clear();
    this.lastResyncByViewer = {};
    this.consumerRecreateAttempts = 0;
    this.audioResyncRequests = 0;
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

  addRemoteIceCandidate = async (
    pc: RTCPeerConnection,
    candidate: RTCIceCandidateInit,
  ) => {
    // ICE may arrive before the offer/answer over Socket.IO. Browsers reject
    // those candidates without a remote description, which used to leave the
    // stream stuck until the viewer refreshed the page.
    if (!pc.remoteDescription) {
      const pending = this.pendingIceCandidates.get(pc) ?? [];
      pending.push(candidate);
      this.pendingIceCandidates.set(pc, pending);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.warn("[screenshare] candidato ICE rejeitado", error);
    }
  };

  flushPendingIceCandidates = async (pc: RTCPeerConnection) => {
    const pending = this.pendingIceCandidates.get(pc);
    if (!pending?.length) {
      return;
    }
    this.pendingIceCandidates.delete(pc);
    await Promise.all(
      pending.map((candidate) => this.addRemoteIceCandidate(pc, candidate)),
    );
  };

  // Only the offering side (the sharer) can drive an ICE restart. A short
  // "disconnected" blip often heals by itself, so wait before restarting and
  // back off between attempts instead of a fixed minimum interval.
  requestIceRestart = (pc: RTCPeerConnection, viewerId: string) => {
    const state = this.rtcRecovery.get(pc) ?? { attempts: 0 };
    this.rtcRecovery.set(pc, state);
    if (state.timer !== undefined) {
      return;
    }
    const delay = iceRestartDelay(state.attempts);
    state.timer = window.setTimeout(() => {
      state.timer = undefined;
      if (
        this.publisherConns[viewerId] !== pc ||
        pc.connectionState === "connected" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "failed"
      ) {
        return;
      }
      state.attempts += 1;
      this.pendingIceRestart.add(pc);
      try {
        if (typeof pc.restartIce === "function") {
          // Fires negotiationneeded -> negotiatePublisher sends an offer with
          // iceRestart: true.
          pc.restartIce();
        } else {
          void this.negotiatePublisher(viewerId, pc);
        }
      } catch {
        void this.negotiatePublisher(viewerId, pc);
      }
      // If this restart does not recover, try again with a longer delay.
      window.setTimeout(() => {
        if (
          this.publisherConns[viewerId] === pc &&
          pc.connectionState === "disconnected"
        ) {
          this.requestIceRestart(pc, viewerId);
        }
      }, ICE_RESTART_RETRY_MS);
    }, delay);
  };

  startAudioMeter = () => {
    this.audioMeter.stop();
    const track = this.localStreamToPublish
      ?.getAudioTracks()
      .find((t) => t.readyState === "live");
    if (!track || this.isLocalStreamAFile) {
      return;
    }
    this.audioMeter.start(track, (level) => {
      const fill = this.audioMeterFill.current;
      if (fill) {
        fill.style.width = `${Math.round(level * 100)}%`;
        fill.dataset.active = level > 0.03 ? "true" : "false";
      }
    });
  };

  stopAudioMeter = () => {
    this.audioMeter.stop();
  };

  // Dropping negotiationneeded while an offer is in flight used to lose the
  // audio m-line: Chrome does not fire the event again, so the viewer kept
  // video from the first offer and never got sound back.
  queuePublisherNegotiation = (viewerId: string, pc: RTCPeerConnection) => {
    this.negotiationQueued.add(pc);
    if (this.negotiationHooked.has(pc)) {
      return;
    }
    this.negotiationHooked.add(pc);
    pc.addEventListener("signalingstatechange", () => {
      if (pc.signalingState !== "stable" || !this.negotiationQueued.has(pc)) {
        return;
      }
      if (this.publisherConns[viewerId] !== pc) {
        return;
      }
      void this.negotiatePublisher(viewerId, pc);
    });
  };

  negotiatePublisher = async (
    viewerId: string,
    pc: RTCPeerConnection,
    retriesLeft = 2,
  ) => {
    if (pc.connectionState === "closed" || this.publisherConns[viewerId] !== pc) {
      return;
    }
    try {
      const iceRestart = this.pendingIceRestart.has(pc);
      if (pc.signalingState === "have-local-offer" && iceRestart) {
        // The previous offer never got an answer; drop it and offer again.
        await pc.setLocalDescription({ type: "rollback" });
      }
      if (pc.signalingState !== "stable") {
        this.queuePublisherNegotiation(viewerId, pc);
        return;
      }
      this.negotiationQueued.delete(pc);
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      // Same fmtp-only Opus tune as the answer, so the sender's local
      // description already asks for stereo music settings. The remote
      // offer is never rewritten.
      await pc.setLocalDescription({
        type: offer.type,
        sdp: tuneOpusFmtp(offer.sdp ?? ""),
      });
      this.pendingIceRestart.delete(pc);
      this.sendSignalSS(viewerId, { sdp: pc.localDescription }, true);
    } catch (e) {
      console.warn("[screenshare] falha ao negociar com espectador", e);
      if (retriesLeft > 0 && this.publisherConns[viewerId] === pc) {
        window.setTimeout(
          () => void this.negotiatePublisher(viewerId, pc, retriesLeft - 1),
          2_000,
        );
      }
    }
  };

  requestSharerResync = (
    sharerId: string,
    reason: "failed" | "audio" | "video" | "disconnected",
  ) => {
    this.sendSignalSS(sharerId, { resync: true, reason });
  };

  resetConsumerConnection = (sharerId: string) => {
    const old = this.consumerConn;
    if (old) {
      old.onconnectionstatechange = null;
      try {
        old.close();
      } catch {
        // already closed
      }
    }
    this.consumerConn = undefined;
    this.remoteShareStream = undefined;
    this.ensureConsumerConnection(sharerId);
  };

  // Sharer side: tear down and rebuild only this viewer's connection. The
  // capture (localStreamToPublish) stays untouched.
  handleResyncRequest = (viewerId: string, reason?: string) => {
    const stream = this.localStreamToPublish;
    if (!stream) {
      return;
    }
    if (
      reason === "audio" &&
      !stream.getAudioTracks().some((track) => track.readyState === "live")
    ) {
      // Nothing to resend: the share genuinely has no audio. A frozen
      // picture uses reason "video" and still rebuilds the connection.
      return;
    }
    const now = Date.now();
    if (now - (this.lastResyncByViewer[viewerId] ?? 0) < 5_000) {
      return;
    }
    this.lastResyncByViewer[viewerId] = now;
    const old = this.publisherConns[viewerId];
    if (old) {
      this.releasePublisher(old);
      delete this.publisherConns[viewerId];
    }
    this.publisherNeedsReset.add(viewerId);
    void this.setupRTCConnections();
  };

  recreateConsumerConnection = (pc: RTCPeerConnection) => {
    const state = this.rtcRecovery.get(pc);
    if (state?.timer !== undefined) {
      window.clearTimeout(state.timer);
      state.timer = undefined;
    }
    pc.onconnectionstatechange = null;
    try {
      pc.close();
    } catch {
      // already closed
    }
    if (this.consumerConn !== pc) {
      return;
    }
    this.consumerConn = undefined;
    this.remoteShareStream = undefined;
    if (this.state.roomMedia.includes("@")) {
      return;
    }
    const attempt = this.consumerRecreateAttempts;
    this.consumerRecreateAttempts += 1;
    if (attempt >= MAX_RECREATE_ATTEMPTS) {
      this.showWarningMessage(
        "Conexão com a transmissão perdida. Atualize a página se não voltar.",
        8000,
      );
      return;
    }
    const delay = recreateDelay(attempt);
    window.clearTimeout(this.consumerRecreateTimer);
    this.consumerRecreateTimer = window.setTimeout(() => {
      const sharer = this.state.participants.find((p) => p.isScreenShare);
      if (
        !sharer ||
        this.consumerConn ||
        this.isLocalStreamAFile ||
        (!this.playingScreenShare() && !this.playingFileShare())
      ) {
        return;
      }
      this.ensureConsumerConnection(sharer.id);
      // The sharer is the offerer: ask it to rebuild its side for us.
      this.requestSharerResync(sharer.id, "failed");
    }, delay);
  };

  recreatePublisherConnection = (viewerId: string, pc: RTCPeerConnection) => {
    this.releasePublisher(pc);
    if (this.publisherConns[viewerId] !== pc) {
      return;
    }
    delete this.publisherConns[viewerId];
    const attempt = this.publisherRecreateAttempts[viewerId] ?? 0;
    this.publisherRecreateAttempts[viewerId] = attempt + 1;
    if (attempt >= MAX_RECREATE_ATTEMPTS) {
      this.showWarningMessage(
        "Não foi possível reconectar um espectador. Ele pode atualizar a página para voltar.",
        8000,
      );
      return;
    }
    this.publisherNeedsReset.add(viewerId);
    const delay = recreateDelay(attempt);
    window.clearTimeout(this.publisherRecreateTimers[viewerId]);
    this.publisherRecreateTimers[viewerId] = window.setTimeout(() => {
      if (!this.localStreamToPublish || this.publisherConns[viewerId]) {
        return;
      }
      void this.setupRTCConnections();
    }, delay);
  };

  scheduleAudioCheck = (delayMs = 4_000) => {
    window.clearTimeout(this.audioCheckTimer);
    const generation = ++this.audioCheckGeneration;
    this.audioCheckTimer = window.setTimeout(() => {
      void this.runAudioCheck(generation);
    }, delayMs);
  };

  runAudioCheck = async (generation: number) => {
    const sharer = this.state.participants.find((p) => p.isScreenShare);
    const pc = this.consumerConn;
    if (
      generation !== this.audioCheckGeneration ||
      !sharer ||
      sharer.id === getOrCreateClientId() ||
      !pc ||
      pc.connectionState !== "connected" ||
      (!this.playingScreenShare() && !this.playingFileShare())
    ) {
      return;
    }
    const video = this.HTMLInterface.getVideoEl();
    const stream = this.remoteShareStream;
    const hasVideo = Boolean(
      stream?.getVideoTracks().some((track) => track.readyState === "live"),
    );
    const hasAudio = Boolean(
      stream?.getAudioTracks().some((track) => track.readyState === "live"),
    );
    const paused = Boolean(video?.paused);
    const sampleVideo = hasVideo && !paused;
    const samplesBefore = hasAudio
      ? await this.getInboundAudioSamples()
      : undefined;
    const framesBefore = sampleVideo
      ? await this.getInboundVideoFrames()
      : undefined;
    if (hasAudio || sampleVideo) {
      await new Promise((resolve) => window.setTimeout(resolve, 1_200));
    }
    if (
      generation !== this.audioCheckGeneration ||
      this.consumerConn !== pc ||
      pc.connectionState !== "connected"
    ) {
      return;
    }
    const samplesAfter = hasAudio
      ? await this.getInboundAudioSamples()
      : undefined;
    const framesAfter = sampleVideo
      ? await this.getInboundVideoFrames()
      : undefined;
    const audioDecision = shareAudioNeedsResync({
      hasLiveVideo: hasVideo,
      hasLiveAudio: hasAudio,
      paused,
      samplesBefore,
      samplesAfter,
    });
    const videoDecision = shareVideoNeedsResync({
      hasLiveVideo: hasVideo,
      paused,
      framesBefore,
      framesAfter,
    });
    // Keep watching for the rest of the share. The first sample often lands
    // while the picture is still healthy; a freeze later in the movie has to
    // be able to ask for a resend too.
    if (audioDecision === "wait" && videoDecision !== "resync") {
      this.scheduleAudioCheck(8_000);
      return;
    }
    if (audioDecision === "ok" && videoDecision !== "resync") {
      this.audioResyncRequests = 0;
      if (this.state.shareAudioMissing) {
        this.setState({ shareAudioMissing: false });
      }
      this.scheduleAudioCheck(8_000);
      return;
    }
    if (
      audioDecision === "resync" &&
      !hasAudio &&
      !this.state.shareAudioMissing
    ) {
      this.setState({ shareAudioMissing: true });
    }
    if (this.audioResyncRequests >= 4) {
      this.scheduleAudioCheck(8_000);
      return;
    }
    // A frozen picture uses "video" so the sharer still resends when the
    // capture has no audio track. Audio-only recovery stays "audio".
    this.audioResyncRequests += 1;
    this.requestSharerResync(
      sharer.id,
      videoDecision === "resync" ? "video" : "audio",
    );
    this.scheduleAudioCheck(8_000);
  };

  ensureConsumerConnection = (sharerId: string) => {
    if (this.consumerConn || this.isLocalStreamAFile) {
      return this.consumerConn;
    }
    const pc = new RTCPeerConnection(this.getRtcConfiguration());
    this.consumerConn = pc;
    this.watchPeerConnection(pc, true);
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalSS(sharerId, { ice: event.candidate });
      }
    };
    if (this.state.shareAudioMissing) {
      this.setState({ shareAudioMissing: false });
    }
    pc.ontrack = (event: RTCTrackEvent) => {
      const leftVideo = this.HTMLInterface.getVideoEl();
      if (!leftVideo) {
        return;
      }
      const tracks = collectRemoteShareTracks(
        this.remoteShareStream?.getTracks(),
        event.streams,
        event.track,
      );
      if (
        leftVideo.srcObject !== this.remoteShareStream ||
        needsRemoteShareReattach(this.remoteShareAttachedIds, tracks)
      ) {
        // Attach before playing. A fresh MediaStream makes Chrome Android
        // re-evaluate audio when the audio track arrives after the video.
        this.attachRemoteShareStream(tracks);
      }
      if (event.track.kind === "audio" && this.state.shareAudioMissing) {
        this.setState({ shareAudioMissing: false });
      }
      const startRemoteTrack = () => {
        if (
          event.track.kind === "audio" &&
          navigator.maxTouchPoints > 0 &&
          !navigator.userActivation?.hasBeenActive &&
          this.soundUnlockedMedia !== this.state.roomMedia
        ) {
          // Touch browsers frequently accept a remote track but block its
          // audio until a real tap. Surface the existing activation control
          // immediately instead of leaving a silent, apparently-playing feed.
          this.localSetMute(true);
          this.armShareSoundPrompt();
        }
        // Always call play() again, even if the element already plays: a
        // reattached srcObject pauses it, and a late audio track needs it.
        // localPlay re-shows "Ativar som" when the browser refuses.
        void this.localPlay();
      };
      event.track.onunmute = startRemoteTrack;
      startRemoteTrack();
    };
    return pc;
  };

  attachRemoteShareStream = (tracks: MediaStreamTrack[]) => {
    const video = this.HTMLInterface.getVideoEl();
    const stream = new MediaStream(tracks);
    this.remoteShareStream = stream;
    this.remoteShareAttachedIds = new Set(tracks.map((track) => track.id));
    if (video) {
      video.removeAttribute("src");
      video.srcObject = stream;
    }
    debugLog(
      `[share-audio] attached stream video=${stream.getVideoTracks().length} audio=${stream.getAudioTracks().length}`,
    );
    return stream;
  };

  getInboundAudioSamples = async (): Promise<number | undefined> => {
    const pc = this.consumerConn;
    if (!pc) {
      return undefined;
    }
    try {
      const stats = await pc.getStats();
      let samples: number | undefined;
      stats.forEach((report: any) => {
        if (report.type === "inbound-rtp" && report.kind === "audio") {
          samples =
            (samples ?? 0) +
            Number(report.totalSamplesReceived ?? report.packetsReceived ?? 0);
        }
      });
      return samples;
    } catch {
      return undefined;
    }
  };

  getInboundVideoFrames = async (): Promise<number | undefined> => {
    const pc = this.consumerConn;
    if (!pc || pc.connectionState !== "connected") {
      return undefined;
    }
    try {
      const stats = await pc.getStats();
      let frames: number | undefined;
      stats.forEach((report: any) => {
        if (report.type !== "inbound-rtp" || report.kind !== "video") {
          return;
        }
        const decoded = Number(report.framesDecoded);
        if (!Number.isFinite(decoded)) {
          return;
        }
        frames = (frames ?? 0) + decoded;
      });
      return frames;
    } catch {
      return undefined;
    }
  };

  // After "Ativar som"/"Recuperar som": if audio tracks exist but playback
  // still looks stalled, reattach a fresh stream and play once more.
  verifyRemoteShareAudio = async () => {
    const video = this.HTMLInterface.getVideoEl();
    const stream = video?.srcObject as MediaStream | null;
    const hasLiveAudio = stream
      ?.getAudioTracks()
      .some((track) => track.readyState === "live");
    if (!video || !stream || !hasLiveAudio || video.muted) {
      return;
    }
    const before = await this.getInboundAudioSamples();
    await new Promise((resolve) => window.setTimeout(resolve, 1_200));
    if (video.srcObject !== stream || video.muted) {
      return;
    }
    const after = await this.getInboundAudioSamples();
    if (!remoteAudioLooksStalled(video.paused, before, after)) {
      return;
    }
    debugLog("[share-audio] audio looks stalled, reattaching once");
    this.attachRemoteShareStream(
      collectRemoteShareTracks(stream.getTracks(), undefined),
    );
    try {
      await video.play();
    } catch (e: any) {
      console.warn("[share-audio] retry play failed", e?.name);
      if (e?.name === "NotAllowedError") {
        this.localSetMute(true);
        this.setState({ isAutoPlayable: false });
        void video.play().catch(() => undefined);
        return;
      }
    }
    // A fresh srcObject cannot revive a sender that stopped after F5.
    // Ask the sharer to open a new connection for us.
    const sharer = this.state.participants.find((p) => p.isScreenShare);
    if (
      sharer &&
      sharer.id !== getOrCreateClientId() &&
      this.audioResyncRequests < 4
    ) {
      this.audioResyncRequests += 1;
      this.requestSharerResync(sharer.id, "audio");
    }
  };

  isRemoteShareViewer = () => {
    const sharer = this.state.participants.find((p) => p.isScreenShare);
    return Boolean(
      sharer &&
        sharer.id !== getOrCreateClientId() &&
        (this.playingScreenShare() || this.playingFileShare()),
    );
  };

  watchPeerConnection = (
    pc: RTCPeerConnection,
    consumer = false,
    viewerId?: string,
  ) => {
    pc.onconnectionstatechange = () => {
      const state = this.rtcRecovery.get(pc);
      if (pc.connectionState === "connected") {
        if (state) {
          window.clearTimeout(state.timer);
          state.timer = undefined;
          state.attempts = 0;
        }
        this.pendingIceRestart.delete(pc);
        if (consumer) {
          this.consumerRecreateAttempts = 0;
          this.scheduleAudioCheck();
        } else if (viewerId) {
          this.publisherRecreateAttempts[viewerId] = 0;
        }
        this.setConnectionQuality("good");
        return;
      }
      if (pc.connectionState === "disconnected") {
        this.setConnectionQuality("reconnecting");
        if (viewerId) {
          // Sharer/offerer: restart ICE after a grace period, with backoff.
          this.requestIceRestart(pc, viewerId);
        } else if (consumer) {
          // Viewer: give the sharer time to restart ICE; if still down,
          // rebuild this connection and ask the sharer to resend.
          const recovery = state ?? { attempts: 0 };
          this.rtcRecovery.set(pc, recovery);
          window.clearTimeout(recovery.timer);
          recovery.timer = window.setTimeout(() => {
            recovery.timer = undefined;
            if (
              this.consumerConn === pc &&
              pc.connectionState === "disconnected"
            ) {
              this.recreateConsumerConnection(pc);
            }
          }, DISCONNECTED_VIEWER_GRACE_MS);
        }
        return;
      }
      if (pc.connectionState === "failed") {
        this.setConnectionQuality("reconnecting");
        if (consumer) {
          this.recreateConsumerConnection(pc);
        } else if (viewerId) {
          this.recreatePublisherConnection(viewerId, pc);
        }
      }
    };
  };

  releasePublisher = (pc: RTCPeerConnection) => {
    pc.onconnectionstatechange = null;
    pc.onnegotiationneeded = null;
    const recovery = this.rtcRecovery.get(pc);
    if (recovery?.timer !== undefined) {
      window.clearTimeout(recovery.timer);
      recovery.timer = undefined;
    }
    this.pendingIceRestart.delete(pc);
    this.negotiationQueued.delete(pc);
    // Do not stop the cloned tracks. Chrome can end the whole getDisplayMedia
    // audio source when any clone is stopped, which mutes every viewer who
    // is still connected. Closing the peer connection is enough: it detaches
    // the sender and leaves the capture running.
    try {
      pc.close();
    } catch {
      // already closed
    }
  };

  attachShareTracks = (pc: RTCPeerConnection) => {
    const stream = this.localStreamToPublish;
    if (!stream) {
      return;
    }
    const existing = new Set(
      pc
        .getSenders()
        .map((sender) => sender.track?.kind)
        .filter((kind): kind is string => Boolean(kind)),
    );
    const missing = stream
      .getTracks()
      .filter(
        (track) => track.readyState === "live" && !existing.has(track.kind),
      );
    tracksToPublish(missing).forEach(({ track }) => {
      pc.addTrack(track, stream);
    });
  };

  watchLocalShareTracks = (stream: MediaStream) => {
    if (this.shareTrackWatcher === stream) {
      return;
    }
    this.shareTrackWatcher = stream;
    stream.addEventListener("addtrack", () => {
      Object.values(this.publisherConns).forEach((pc) => {
        if (pc.connectionState !== "closed") {
          this.attachShareTracks(pc);
        }
      });
    });
  };

  noteShareCaptureHeight = async () => {
    if (!this.localStreamToPublish || this.isLocalStreamAFile) {
      return;
    }
    const captureHeight = Number(
      this.localStreamToPublish.getVideoTracks()[0]?.getSettings?.().height ??
        0,
    );
    if (captureHeight > 0 && captureHeight !== this.lastShareCaptureHeight) {
      this.lastShareCaptureHeight = captureHeight;
      await this.applyAdaptiveShareQuality();
    }
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
          this.releasePublisher(value);
          delete this.publisherConns[key];
          delete this.viewerEpoch[key];
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
        const nextEpoch = user.epoch;
        if (
          this.publisherConns[id] &&
          viewerConnectionReplaced(this.viewerEpoch[id], nextEpoch)
        ) {
          // Same person, new page. The old connection's ICE restart keeps
          // video and drops audio. Tear it down and offer again from scratch.
          this.releasePublisher(this.publisherConns[id]);
          delete this.publisherConns[id];
          this.publisherNeedsReset.add(id);
        }
        if (typeof nextEpoch === "number") {
          this.viewerEpoch[id] = nextEpoch;
        }
        if (!this.publisherConns[id]) {
          if (this.publisherNeedsReset.delete(id)) {
            // Tell the viewer to drop its stale consumer connection first;
            // signaling messages are ordered, so the offer below follows it.
            this.sendSignalSS(id, { reset: true }, true);
          }
          // Set up the RTCPeerConnection for sharing media to each member
          const pc = new RTCPeerConnection(this.getRtcConfiguration());
          this.publisherConns[id] = pc;
          this.watchPeerConnection(pc, false, id);
          this.attachShareTracks(pc);
          if (!this.isLocalStreamAFile) {
            applyVideoCodecPreferences(pc);
          }
          pc.onicecandidate = (event) => {
            // We generated an ICE candidate, send it to peer
            if (event.candidate) {
              this.sendSignalSS(id, { ice: event.candidate }, true);
            }
          };
          pc.onnegotiationneeded = () => {
            // Start (or restart, with iceRestart: true) the connection for
            // this peer's video. Errors are handled and retried inside.
            void this.negotiatePublisher(id, pc);
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

  changeController = async (value: string | null) => {
    // debugLog(data);
    this.socket.emit("CMD:changeController", value);
  };

  sendSignalSS = async (to: string, data: any, sharer?: boolean) => {
    // debugLog('sendSS', to, data);
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

  isPauseDisabled = () => {
    return this.playingScreenShare();
  };

  localSeek = (customTime?: number) => {
    // Jump to the leader's position, or a custom one
    let target = customTime ?? this.getLeaderTime();
    // For live this is the offset from the leading edge (negative)
    if (this.state.isLiveStream) {
      target = this.Player().getDuration() + (customTime ?? 0);
    }
    if (target >= 0 && target < Infinity) {
      debugLog("syncing self to leader or custom:", target);
      this.Player().seekVideo(target);
    }
  };

  // fromGesture is only true for the person who just chose the video.
  // Everyone else starts muted: Chrome will play a muted YouTube video
  // without a tap, then "Ativar som" turns the sound on in that tap.
  playYouTubeWithRoom = (fromGesture: boolean) => {
    if (fromGesture || this.youtubeSoundUnlocked) {
      this.youtubeSoundUnlocked = true;
      this.YouTubeInterface.setMute(false);
      if (this.YouTubeInterface.getVolume() === 0) {
        this.YouTubeInterface.setVolume(1);
      }
      void this.YouTubeInterface.playVideo();
      this.setState({
        roomPaused: false,
        playbackNeedsGesture: false,
        soundPromptMedia: "",
        isAutoPlayable: true,
      });
      return;
    }
    this.YouTubeInterface.setMute(true);
    void this.YouTubeInterface.playVideo();
    this.setState({
      roomPaused: false,
      playbackNeedsGesture: true,
      isAutoPlayable: false,
    });
  };

  localPlay = async (attempt = 0) => {
    if (!this.state.roomMedia) {
      return;
    }
    const canAutoplay = this.state.isAutoPlayable || (await testAutoplay());
    this.setState(
      { roomPaused: false, isAutoPlayable: canAutoplay },
      async () => {
        const remoteShareUnlocked =
          this.soundUnlockedMedia === this.state.roomMedia &&
          this.isRemoteShareViewer();
        if (remoteShareUnlocked) {
          this.localSetMute(false);
          this.localSetVolume(1);
        } else if (
          !this.state.isAutoPlayable ||
          (this.localStreamToPublish && !this.isLocalStreamAFile)
        ) {
          debugLog("auto-muting to allow autoplay or screenshare host");
          this.localSetMute(true);
        } else {
          this.localSetMute(false);
        }
        try {
          await this.Player().playVideo();
        } catch (e: any) {
          if (e?.name === "AbortError" && attempt === 0) {
            // A new srcObject/load interrupted play(); try once more instead
            // of leaving the element paused (muted or not).
            window.setTimeout(() => void this.localPlay(1), 250);
            return;
          }
          if (
            (e?.name === "NotAllowedError" ||
              e?.name === "AbortError") &&
            !this.Player().isMuted()
          ) {
            // Tablets commonly block the first unmuted play. Start the stream
            // muted so video/tracks remain connected, then show the explicit
            // "Ativar som" action which supplies the required user gesture.
            this.localSetMute(true);
            this.setState({ isAutoPlayable: false });
            this.armShareSoundPrompt();
            try {
              await this.Player().playVideo();
              return;
            } catch (mutedError) {
              console.warn("[autoplay muted fallback]", mutedError);
            }
          }
          console.warn(e, e?.name);
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

  // Must run from a user gesture (tap): unmutes and starts playback in this
  // same turn. Waiting on setState drops the gesture and tablets stay silent.
  activateSound = () => {
    const media = this.state.roomMedia;
    const isOwnShare = Boolean(
      this.localStreamToPublish && !this.isLocalStreamAFile,
    );
    if (!isOwnShare && this.isRemoteShareViewer()) {
      this.soundUnlockedMedia = media;
      const video = this.HTMLInterface.getVideoEl();
      const current =
        (video?.srcObject as MediaStream | null) ?? this.remoteShareStream;
      if (current) {
        this.attachRemoteShareStream(
          collectRemoteShareTracks(current.getTracks(), undefined),
        );
      }
      if (!video) {
        return;
      }
      video.muted = false;
      video.volume = 1;
      const playPromise = video.play();
      this.setState({
        isAutoPlayable: true,
        soundPromptMedia: "",
        roomPaused: false,
      });
      void playPromise
        ?.then(() => {
          window.clearTimeout(this.soundVerifyTimer);
          this.soundVerifyTimer = window.setTimeout(
            () => void this.verifyRemoteShareAudio(),
            300,
          );
        })
        .catch(() => {
          video.muted = true;
          this.soundUnlockedMedia = "";
          this.setState({ isAutoPlayable: false, soundPromptMedia: media });
          void video.play().catch(() => undefined);
          this.showWarningMessage("Toque novamente para ativar o som.", 4000);
        });
      return;
    }
    if (this.usingYoutube()) {
      this.youtubeSoundUnlocked = true;
      this.YouTubeInterface.setMute(false);
      if (this.YouTubeInterface.getVolume() === 0) {
        this.YouTubeInterface.setVolume(1);
      }
      void this.YouTubeInterface.playVideo();
      if (
        (this.state.roomPaused || this.state.playbackNeedsGesture) &&
        this.haveLock()
      ) {
        this.suppressYouTubeStateSyncUntil = Date.now() + 1500;
        this.socket.emit("CMD:play");
      }
      this.setState({
        playbackNeedsGesture: false,
        soundPromptMedia: "",
        roomPaused: false,
        isAutoPlayable: true,
      });
      window.clearTimeout(this.playbackGestureTimer);
      this.playbackGestureTimer = window.setTimeout(() => {
        const state =
          this.YouTubeInterface.watchPartyYTPlayer?.getPlayerState();
        if (
          state !== window.YT?.PlayerState?.PLAYING &&
          this.usingYoutube() &&
          !this.state.roomPaused
        ) {
          this.youtubeSoundUnlocked = false;
          this.setState({ playbackNeedsGesture: true });
        }
      }, 700);
      return;
    }
    const video = this.HTMLInterface.getVideoEl();
    if (!video) {
      return;
    }
    video.muted = false;
    video.volume = 1;
    const playPromise = video.play();
    this.setState({
      isAutoPlayable: true,
      playbackNeedsGesture: false,
      roomPaused: false,
    });
    void playPromise?.catch(() => {
      video.muted = true;
      this.setState({ isAutoPlayable: false });
      void video.play().catch(() => undefined);
      this.showWarningMessage("Toque novamente para ativar o som.", 4000);
    });
  };

  armShareSoundPrompt = () => {
    const media = this.state.roomMedia;
    if (!media || (!this.playingScreenShare() && !this.playingFileShare())) {
      return;
    }
    if (this.localStreamToPublish) {
      return;
    }
    if (this.soundUnlockedMedia === media || this.state.soundPromptMedia === media) {
      return;
    }
    this.setState({ soundPromptMedia: media });
  };

  publishSeek = (time: number) => {
    const target = Math.max(time, 0);
    this.suppressYouTubeStateSyncUntil = Date.now() + 1500;
    this.suppressSeekPublishUntil = Date.now() + 1500;
    this.observedMediaTime = target;
    this.observedAt = Date.now();
    this.socket.emit("CMD:seek", this.getRoomTSToSet(target));
  };

  setYouTubeCaptionsEnabled = (enabled: boolean) => {
    this.setState({ youtubeCaptionsEnabled: enabled }, () => {
      this.YouTubeInterface.setCaptionsEnabled(enabled);
    });
  };

  recoverRemoteAudio = async () => {
    const video = this.HTMLInterface.getVideoEl();
    const stream = video?.srcObject as MediaStream | null;
    const hasLiveAudio = stream
      ?.getAudioTracks()
      .some((track) => track.readyState === "live");
    if (stream && hasLiveAudio) {
      // Inside the tap: reattach a fresh stream so Chrome Android re-reads
      // the audio track, then play unmuted from the same gesture.
      this.attachRemoteShareStream(
        collectRemoteShareTracks(stream.getTracks(), undefined),
      );
    }
    this.activateSound();
    if (!hasLiveAudio) {
      const sharer = this.state.participants.find((p) => p.isScreenShare);
      if (sharer && sharer.id !== getOrCreateClientId()) {
        this.requestSharerResync(sharer.id, "audio");
      }
      this.showWarningMessage(
        "Nenhuma faixa de áudio chegou. Pedi ao transmissor para reenviar; se continuar sem som, confirme “Compartilhar áudio” da aba.",
        8000,
      );
    }
  };

  roomSetPlaybackRate = (rate: number) => {
    // emit an event to the server
    this.socket.emit("CMD:playbackRate", rate);
  };

  roomSetLoop = (loop: boolean) => {
    this.socket.emit("CMD:loop", loop);
  };

  roomTogglePlay = () => {
    if (!this.haveLock() || this.isPauseDisabled()) {
      return;
    }
    const shouldPlay = this.Player().shouldPlay();
    this.suppressYouTubeStateSyncUntil = Date.now() + 1500;
    if (shouldPlay) {
      if (this.usingYoutube()) {
        this.YouTubeInterface.setMute(false);
        if (this.YouTubeInterface.getVolume() === 0) {
          this.YouTubeInterface.setVolume(1);
        }
      }
      void this.Player().playVideo();
      this.socket.emit("CMD:play");
      this.setState({
        roomPaused: false,
        playbackNeedsGesture: false,
        isAutoPlayable: true,
      });
    } else {
      this.Player().pauseVideo();
      this.socket.emit("CMD:pause");
      this.setState({ roomPaused: true });
    }
  };

  roomSeek = (time: number) => {
    if (!this.haveLock() || this.isPauseDisabled()) {
      return;
    }
    const target = Math.max(time, 0);
    this.Player().seekVideo(target);
    this.publishSeek(target);
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
    if (bVideoOnly || isTouchLayout()) {
      // fullscreen player shell so floating chat remains available
      // (phones and touch tablets)
      container =
        (document.getElementById("watchPlayerShell") as HTMLElement) ??
        this.Player().getVideoEl();
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
    if (!this.usingNative()) {
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
      this.showWarningMessage(
        "Picture in Picture indisponível neste navegador.",
      );
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
    if (isYouTube(value)) {
      this.youtubeStartByMe = true;
      this.youtubeStartUrl = value;
      this.youtubeSoundUnlocked = true;
      window.clearTimeout(this.youtubeStartTimer);
      this.youtubeStartTimer = window.setTimeout(() => {
        this.youtubeStartByMe = false;
      }, 5000);
    }
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
    const nextName =
      normalized || (options?.forceFallback ? DEFAULT_CHAT_NAME : "");
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

  updatePicture = (url: string) => {
    this.setState({ myPicture: url });
    this.socket.emit("CMD:picture", url);
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
    if (isMagnet(input)) {
      const magnetParsed = new URLSearchParams(input);
      const index = magnetParsed.get("fileIndex");
      return (
        magnetParsed.get("dn") + (index != null ? ` (arquivo ${index})` : "")
      );
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
    const name = normalizeDisplayName(
      this.state.nameMap[userId] || "Convidado",
    );
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
    this.countdownTimeouts.forEach((timeoutId) =>
      window.clearTimeout(timeoutId),
    );
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
      const timeoutId = window.setTimeout(
        () => {
          this.setState({ countdownText: text });
        },
        startDelay + index * 1000,
      );
      this.countdownTimeouts.push(timeoutId);
    });
    const playTimeout = window.setTimeout(
      () => {
        this.setState({ countdownText: "PLAY!" });
      },
      startDelay + sequence.length * 1000,
    );
    this.countdownTimeouts.push(playTimeout);
    const hideTimeout = window.setTimeout(
      () => {
        this.setState({
          countdownVisible: false,
          countdownText: "",
          countdownInProgress: false,
        });
        this.clearCountdownTimers();
      },
      startDelay + sequence.length * 1000 + 800,
    );
    this.countdownTimeouts.push(hideTimeout);
  };

  startCountdown = () => {
    if (
      !this.haveLock() ||
      this.state.countdownInProgress ||
      !this.state.roomMedia
    ) {
      return;
    }
    this.socket?.emit("CMD:startCountdown");
  };

  commitRoomTitle = (nextTitle: string) => {
    const title = normalizeDisplayName(nextTitle).slice(0, 40);
    this.setState({ roomTitle: title });
    if (
      !this.socket?.connected ||
      !this.state.owner ||
      clientId !== this.state.owner
    ) {
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
      this.state.unreadCount === 1
        ? "mensagem não lida"
        : "mensagens não lidas";
    const unreadAriaLabel = `${this.state.unreadCount} ${unreadLabel}`;
    // Compact count bubble everywhere (full text stays in aria-label/title) so
    // it never spills over the player controls.
    const unreadBadgeLabel =
      this.state.unreadCount > 99 ? "99+" : String(this.state.unreadCount);
    const canAdjustScreenShareQuality = Boolean(
      sharer &&
      sharer.id !== selfId &&
      (this.playingScreenShare() || this.playingFileShare()),
    );
    const canAdjustYouTubeQuality = Boolean(this.usingYoutube());
    const isHostUser = Boolean(
      (this.state.owner && clientId === this.state.owner) ||
      (this.state.roomLock && clientId === this.state.roomLock),
    );
    const canTriggerCountdown = Boolean(
      isHostUser &&
      this.haveLock() &&
      this.state.roomMedia &&
      !this.playingScreenShare() &&
      !this.playingFileShare(),
    );
    const canStopHostedMedia = Boolean(
      this.haveLock() &&
      this.state.roomMedia &&
      !this.localStreamToPublish &&
      !this.playingScreenShare() &&
      !this.playingFileShare(),
    );
    const playlist = this.state.playlist;
    const hasShareAudio = Boolean(
      this.localStreamToPublish
        ?.getAudioTracks()
        .some((track) => track.readyState === "live"),
    );
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
        showAudioRecovery={Boolean(
          sharer &&
            sharer.id !== selfId &&
            (this.playingScreenShare() || this.playingFileShare()),
        )}
        onRecoverAudio={this.recoverRemoteAudio}
        showTransportControls={Boolean(
          this.state.roomMedia &&
            this.hasDuration() &&
            !this.state.isLiveStream &&
            !this.playingScreenShare() &&
            !this.playingFileShare(),
        )}
        transportDisabled={!this.haveLock()}
        paused={this.state.roomPaused || this.state.playbackNeedsGesture}
        onTogglePlay={this.roomTogglePlay}
        onSeekBy={(seconds) =>
          this.roomSeek(this.Player().getCurrentTime() + seconds)
        }
        captionsEnabled={this.state.youtubeCaptionsEnabled}
        showCaptionsControl={canAdjustYouTubeQuality}
        onToggleCaptions={() =>
          this.setYouTubeCaptionsEnabled(!this.state.youtubeCaptionsEnabled)
        }
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
        {this.state.isScreenShareModalOpen && (
          <ScreenShareModal
            closeModal={() => this.setState({ isScreenShareModalOpen: false })}
            startScreenShare={this.startScreenShare}
            mode={getScreenShareMode(readShareCaptureEnv())}
            unsupportedMessage={screenShareUnsupportedMessage(
              readShareCaptureEnv(),
            )}
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
        {this.state.state === "starting" && (
          <Overlay className={styles.flexCenter}>
            <Title order={2}>Carregando...</Title>
          </Overlay>
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
              width: "min(92vw, 480px)",
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
                  <span style={{ color: toast.color }}>{toast.name}</span>{" "}
                  entrou na sala
                </div>
              </div>
            ))}
          </div>
        )}
        {!this.state.fullScreen && (
          <div className={styles.topBarWrap}>
            <TopBar
              hideNewRoom
              roomTitle={this.state.roomTitle}
              roomDescription={this.state.roomDescription}
              roomTitleColor={this.state.roomTitleColor}
              roomTitleEditable={Boolean(
                this.state.owner && clientId === this.state.owner,
              )}
              onRoomTitleCommit={this.commitRoomTitle}
            />
          </div>
        )}
        {
          <main className={`${styles.roomShell} ${styles.mobileStack}`}>
            <h1 className={styles.srOnly}>Sala de cinema WebCineTV</h1>
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
                      <div className={styles.searchFieldWrap}>
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
                      </div>
                      <div className={styles.topActions}>
                        {canStopHostedMedia && (
                          <Button
                            color="red"
                            onClick={() => this.roomSetMedia("")}
                            leftSection={<IconX />}
                            className={`${styles.topActionButton} ${styles.topActionDanger}`}
                            aria-label="Parar transmissão"
                          >
                            Parar transmissão
                          </Button>
                        )}
                        {this.localStreamToPublish && (
                          <Button
                            color="red"
                            onClick={this.stopPublishingLocalStream}
                            leftSection={<IconX />}
                            className={`${styles.topActionButton} ${styles.topActionDanger}`}
                            aria-label={t("stopShare")}
                          >
                            {t("stopShare")}
                          </Button>
                        )}
                        {this.state.uploadController && (
                          <Button
                            color="red"
                            onClick={() => {
                              this.state.uploadController?.abort();
                            }}
                            leftSection={<IconX />}
                            className={`${styles.topActionButton} ${styles.topActionDanger}`}
                            aria-label="Parar conversão"
                          >
                            Parar conversão
                          </Button>
                        )}
                        <Menu>
                          <Menu.Target>
                            <Button
                              data-testid="playlist-button"
                              color="#666666"
                              leftSection={<IconList />}
                              rightSection={
                                <Badge circle>{playlist.length}</Badge>
                              }
                              className={`${styles.shareButton} ${styles.topActionButton}`}
                              title={t("playlist")}
                              aria-label={`${t("playlist")} (${playlist.length})`}
                            >
                              {t("playlist")}
                            </Button>
                          </Menu.Target>
                          <Menu.Dropdown
                            className={styles.queueDropdown}
                            style={{
                              overflowY:
                                playlist.length > 0 ? "scroll" : undefined,
                              maxHeight: 400,
                              maxWidth: "min(92vw, 600px)",
                            }}
                          >
                            {playlist.length === 0 && (
                              <Menu.Item disabled>
                                Não há itens na fila.
                              </Menu.Item>
                            )}
                            {playlist.map(
                              (item: PlaylistVideo, index: number) => {
                                const normalizedItem = Boolean(item.img)
                                  ? { ...item, type: "youtube" }
                                  : item;
                                return (
                                  <Menu.Item
                                    key={index}
                                    className={styles.queueItem}
                                  >
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
                              },
                            )}
                          </Menu.Dropdown>
                        </Menu>
                        <InviteButton className={styles.topActionButton} />
                        <Button
                          data-testid="settings-button"
                          color="#666666"
                          title="Configurações"
                          aria-label="Configurações"
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
                      </div>
                    </div>
                  </section>
                )}
                <div className={styles.playerArea} id="watchPlayerShell">
                  <div
                    className={`${styles.playerContainer} ${
                      this.state.roomMedia ? styles.playerContainerHasMedia : ""
                    }`}
                  >
                    {Boolean(
                      sharer &&
                      sharer.id !== selfId &&
                      (this.playingScreenShare() || this.playingFileShare()),
                    ) && (
                      <div className={styles.liveShareBadge}>
                        <span className={styles.liveShareDot} />
                        <span className={styles.liveShareLabel}>AO VIVO</span>
                        <span className={styles.liveShareOwner}>
                          Tela de{" "}
                          {this.state.nameMap[sharer!.id] || "Participante"}
                        </span>
                      </div>
                    )}
                    {this.state.shareAudioMissing &&
                      this.playingScreenShare() &&
                      Boolean(sharer && sharer.id !== selfId) &&
                      !this.remoteShareStream
                        ?.getAudioTracks()
                        .some((track) => track.readyState === "live") && (
                        <div className={styles.shareAudioBanner} role="status">
                          Esta transmissão está sem áudio. Peça para quem
                          compartilha marcar “Compartilhar áudio”.
                        </div>
                      )}
                    {this.localStreamToPublish &&
                      !this.isLocalStreamAFile &&
                      this.playingScreenShare() && (
                        <div
                          className={styles.audioMeter}
                          title={
                            hasShareAudio
                              ? "Nível do áudio transmitido"
                              : "A captura não inclui áudio"
                          }
                        >
                          <span className={styles.audioMeterLabel}>
                            {hasShareAudio ? "Áudio" : "Sem áudio"}
                          </span>
                          {hasShareAudio && (
                            <span className={styles.audioMeterTrack}>
                              <span
                                ref={this.audioMeterFill}
                                className={styles.audioMeterFill}
                              />
                            </span>
                          )}
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
                    {(this.state.loading ||
                      !this.state.roomMedia ||
                      this.state.nonPlayableMedia) &&
                      !this.state.isLiveStream && (
                        <div
                          id="loader"
                          className={`${styles.videoContent} ${styles.flexCenter} ${styles.emptyStage}`}
                        >
                          {this.state.loading && (
                            <div
                              className={`${styles.flexCenter} ${styles.loaderStack}`}
                            >
                              <Loader />
                              <div>
                                {false
                                  ? false
                                    ? "Iniciando navegador virtual. Isso pode levar até 1 minuto."
                                    : "Navegador virtual temporariamente indisponível."
                                  : ""}
                              </div>
                            </div>
                          )}
                          {!this.state.loading &&
                            !this.state.roomMedia &&
                            !this.localStreamToPublish &&
                            !sharer && (
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
                      src="https://www.youtube.com/embed/?enablejsapi=1&controls=0&rel=0&playsinline=1&vq=hd1080&cc_load_policy=0&iv_load_policy=3"
                    />
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
                    {((this.state.soundPromptMedia === this.state.roomMedia &&
                      Boolean(this.state.roomMedia)) ||
                      this.state.playbackNeedsGesture) && (
                      <div className={styles.watchPrompt}>
                        <div className={styles.soundPrompt}>
                          <Button
                            className={styles.soundPromptButton}
                            onClick={() => this.activateSound()}
                            leftSection={<IconVolume />}
                            size="xl"
                          >
                            {this.state.soundPromptMedia ===
                            this.state.roomMedia
                              ? "Ativar som"
                              : "Toque para assistir"}
                          </Button>
                          <div className={styles.soundPromptHint}>
                            {this.state.soundPromptMedia ===
                            this.state.roomMedia
                              ? "Toque para ouvir a transmissão"
                              : "Toque para acompanhar a sala"}
                          </div>
                        </div>
                      </div>
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
                    {/* Inside the player box so the controls stay pinned to
                        the video even when the chat is laid out below it. */}
                    {this.state.roomMedia && (
                      <div className={styles.controlsDock}>{controls}</div>
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
                          <div className={styles.peopleList}>
                            {this.state.participants.map((participant) => {
                              const name =
                                this.state.nameMap[participant.id] ||
                                participant.id;
                              const color =
                                getReadableNameColor(
                                  this.state.nameColorMap[participant.id],
                                ) ??
                                getReadableNameColor(
                                  `#${getColorForStringHex(participant.id)}`,
                                );
                              const picture =
                                this.state.pictureMap[participant.id] ||
                                getDefaultPicture(
                                  name,
                                  getColorForStringHex(participant.id),
                                );
                              const isSelf = participant.id === selfId;
                              const isOwner =
                                participant.id === this.state.owner;
                              return (
                                <div
                                  key={participant.id}
                                  className={styles.peopleListItem}
                                >
                                  <img
                                    className={styles.peopleAvatar}
                                    src={picture}
                                    alt=""
                                    aria-hidden="true"
                                  />
                                  <div className={styles.peopleMeta}>
                                    <div className={styles.peopleNameRow}>
                                      <span
                                        className={`${styles.peopleName} ${
                                          color ? "wc-name-color" : ""
                                        }`}
                                        style={
                                          color
                                            ? ({
                                                "--name-color": color,
                                              } as React.CSSProperties)
                                            : undefined
                                        }
                                        title={name}
                                      >
                                        {name}
                                      </span>
                                      {isSelf && (
                                        <span className={styles.peopleBadge}>
                                          Você
                                        </span>
                                      )}
                                      {isOwner && (
                                        <span className={styles.peopleBadge}>
                                          Host
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
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
                </div>
              </div>
            </div>
          </main>
        }
      </React.Fragment>
    );
  }
}
