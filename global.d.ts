type StringDict = Record<string, string>;
type NumberDict = Record<string, number>;
type BooleanDict = Record<string, boolean>;
type AnyDict = Record<string, any>;
type PCDict = Record<string, RTCPeerConnection>;
interface MediaHealth {
  videoWidth: number;
  videoHeight: number;
  framesPerSecond: number;
  bitrateKbps: number;
  packetLossPercent: number;
  roundTripMs: number;
  transport: "relay" | "p2p" | "unknown";
  audioTrack: "active" | "missing" | "blocked";
}
type HTMLVideoElementDict = Record<string, HTMLVideoElement>;
type MediaType = "vbrowser" | "screenshare" | "video" | "youtube";

interface User {
  id: string;
  isVideoChat?: boolean;
  isScreenShare?: boolean;
}

interface LiveReactionEvent {
  user: string;
  emoji: string;
  timestamp: string;
  nonce?: string;
}

interface ChatMessageBase {
  id: string;
  cmd?: string;
  msg?: string;
  system?: boolean;
  isSub?: boolean;
}

interface ChatMessage extends ChatMessageBase {
  timestamp: string;
  videoTS?: number;
}

interface Settings {
  disableChatSound?: boolean;
}

interface PlaylistVideo {
  url: string;
  name: string;
  img?: string;
  channel?: string;
  duration: number;
  type: string;
}

interface SearchResult extends PlaylistVideo {
  size?: string | number;
  seeders?: string;
  magnet?: string;
  type: "youtube" | "file" | "magnet";
  url: string;
  name: string;
  duration: number;
}

interface HostState {
  video: string;
  videoTS: number;
  paused: boolean;
  isVBrowserLarge: boolean;
  controller?: string;
  playbackRate: number;
  loop: boolean;
}

interface PersistentRoom {
  roomId: string;
  password: string;
  owner: string;
  vanity: string;
  isChatDisabled: boolean;
  isSubRoom: boolean;
  data: any;
}

interface LinkAccount {
  accountname: string;
  accountid: string;
  discriminator: string;
  kind: string;
}

interface ShardMetric {
  uptime: number;
  mem: number;
  roomCount: number;
  users: number;
  vbWaiting: number;
}
