import type {
  ShareContentHint,
  ShareQualityMode,
  ShareQualityProfile,
  SenderEncoding,
} from "./types";

// Single source of truth for screen-share quality. Tune values here instead of
// scattering numbers through App.tsx.
//
// Background: "maintain-framerate" and later "balanced" (under CPU or loss)
// let libwebrtc's quality scaler shrink the picture, often to 540p, for
// every viewer. The scaler does not restore 1080p when the pressure clears,
// so one F5 or a flickering "cpu" limitation left both peers soft until the
// share was restarted. Resolution is now always held. A weak link lowers
// bitrate only. Oversize captures are scaled to the target height explicitly.
export const SHARE_QUALITY = {
  // Per-viewer bitrate cap in "auto" mode. 1080p30 film content looks clean
  // at ~4-6 Mbps; congestion control still sends less when the link is
  // weaker, this is only the ceiling.
  perPeerMaxBitrate: 5_000_000,
  perPeerMinBitrate: 1_200_000,
  // Total sender uplink budget, split between viewers (mesh: one encode per
  // viewer).
  totalBudgetByPeers: [
    { maxPeers: 2, bitrate: 10_000_000 },
    { maxPeers: 4, bitrate: 14_000_000 },
    { maxPeers: 8, bitrate: 18_000_000 },
    { maxPeers: Infinity, bitrate: 20_000_000 },
  ],
  // Capture resolution chosen from the per-viewer budget.
  minBitrateFor1080p: 3_000_000,
  minBitrateFor720p: 1_500_000,
  maxFramerate: 30,
  lowBitrateFramerate: 24,
  lowBitrateFramerateBelow: 1_600_000,
  // Viewer-selected modes.
  high: { minBitrate: 5_000_000, maxBitrate: 8_000_000, factor: 1.35 },
  economy: {
    minBitrate: 1_000_000,
    maxBitrate: 3_000_000,
    factor: 0.85,
    maxFramerate: 24,
    targetHeight: 720,
  },
  // Network adaptation (loss/RTT driven, see evaluateNetworkSample).
  adaptiveMinBitrate: 700_000,
  minNetworkScale: 0.4,
  // Recovery after the link is clean again: +step every N clean 2s samples.
  recoveryStableSamples: 5,
  recoveryStep: 0.1,
  // CPU adaptation: after N consecutive "cpu" limited samples the sender
  // switches to "balanced" (fewer pixels instead of dropped frames), and goes
  // back to holding resolution after M clean samples.
  cpuLimitedSamplesToAdapt: 3,
  cpuCleanSamplesToRecover: 15,
} as const;

export const MIN_NETWORK_SCALE = SHARE_QUALITY.minNetworkScale;
export const MIN_PEER_BITRATE = SHARE_QUALITY.adaptiveMinBitrate;

export function normalizeShareQualityMode(value: unknown): ShareQualityMode {
  if (value === "economy" || value === "high") {
    return value;
  }
  return "auto";
}

export function getShareQualityLabel(mode: ShareQualityMode): string {
  if (mode === "economy") {
    return "720p";
  }
  if (mode === "high") {
    return "1080p";
  }
  return "Auto";
}

function getTotalBitrateBudget(peers: number): number {
  const tier =
    SHARE_QUALITY.totalBudgetByPeers.find((t) => peers <= t.maxPeers) ??
    SHARE_QUALITY.totalBudgetByPeers[
      SHARE_QUALITY.totalBudgetByPeers.length - 1
    ];
  return tier.bitrate;
}

// Base profile for the room size. Small rooms keep a 1080p source at up to
// 5 Mbps per viewer; larger rooms split the total budget and step down to
// 720p (and 540p/24 only for very large rooms).
export function getShareQualityProfile(peerCount: number): ShareQualityProfile {
  const peers = Math.max(1, peerCount);
  const maxBitratePerPeer = Math.round(
    Math.max(
      SHARE_QUALITY.perPeerMinBitrate,
      Math.min(
        SHARE_QUALITY.perPeerMaxBitrate,
        getTotalBitrateBudget(peers) / peers,
      ),
    ),
  );
  let captureHeight = 1080;
  if (maxBitratePerPeer < SHARE_QUALITY.minBitrateFor1080p) {
    captureHeight = 720;
  }
  if (maxBitratePerPeer < SHARE_QUALITY.minBitrateFor720p) {
    captureHeight = 540;
  }
  const captureWidth =
    captureHeight >= 1080 ? 1920 : captureHeight >= 720 ? 1280 : 960;
  const maxFramerate =
    maxBitratePerPeer < SHARE_QUALITY.lowBitrateFramerateBelow
      ? SHARE_QUALITY.lowBitrateFramerate
      : SHARE_QUALITY.maxFramerate;
  return {
    captureWidth,
    captureHeight,
    maxFramerate,
    maxBitratePerPeer,
  };
}

function resolveScaleResolutionDownBy(
  captureHeight: number,
  targetHeight: number,
) {
  if (captureHeight <= targetHeight) {
    return 1;
  }
  return Number((captureHeight / targetHeight).toFixed(2));
}

export function getViewerSenderProfile(
  baseProfile: ShareQualityProfile,
  mode: ShareQualityMode,
): ShareQualityProfile {
  if (mode === "economy") {
    const economy = SHARE_QUALITY.economy;
    return {
      ...baseProfile,
      maxBitratePerPeer: Math.max(
        economy.minBitrate,
        Math.min(
          economy.maxBitrate,
          Math.round(baseProfile.maxBitratePerPeer * economy.factor),
        ),
      ),
      maxFramerate: Math.min(baseProfile.maxFramerate, economy.maxFramerate),
      // Target quality: 720p for this viewer, when host capture allows it.
      scaleResolutionDownBy: resolveScaleResolutionDownBy(
        baseProfile.captureHeight,
        economy.targetHeight,
      ),
    };
  }
  if (mode === "high") {
    const high = SHARE_QUALITY.high;
    return {
      ...baseProfile,
      maxBitratePerPeer: Math.min(
        high.maxBitrate,
        Math.max(
          high.minBitrate,
          Math.round(baseProfile.maxBitratePerPeer * high.factor),
        ),
      ),
      maxFramerate: SHARE_QUALITY.maxFramerate,
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
}

// Movies are the main use case, so every surface defaults to "motion" (the
// realtime video encoder mode, smooth motion). "detail" (screenshare encoder
// mode, sharp text but it drops frames on motion) is only used for an
// explicit text/UI override.
export function getShareContentHint(
  track: Pick<MediaStreamTrack, "getSettings"> | undefined,
  override?: ShareContentHint,
): ShareContentHint {
  if (override) {
    return override;
  }
  const surface = (
    track?.getSettings?.() as
      | (MediaTrackSettings & { displaySurface?: string })
      | undefined
  )?.displaySurface;
  // "browser" (tab), "window" and "monitor" all default to motion because the
  // use case is watching movies; unknown surfaces behave the same.
  void surface;
  return "motion";
}

// Applies the network scale (and content hint) to the base profile.
export function getAdaptiveProfile(
  baseProfile: ShareQualityProfile,
  networkScale: number,
  contentHint: ShareContentHint,
): ShareQualityProfile {
  return {
    ...baseProfile,
    // Motion keeps its frame rate; only "detail" content trades frames for
    // pixels on a weak link.
    maxFramerate:
      contentHint === "detail" && networkScale < 0.7
        ? Math.min(SHARE_QUALITY.lowBitrateFramerate, baseProfile.maxFramerate)
        : baseProfile.maxFramerate,
    maxBitratePerPeer: Math.max(
      MIN_PEER_BITRATE,
      Math.round(baseProfile.maxBitratePerPeer * networkScale),
    ),
  };
}

// The encoder may drop frames under pressure, but it may not shrink the
// picture. "balanced" and "maintain-framerate" arm libwebrtc's quality
// scaler, which steps a 1080p share down to 540p for every viewer and does
// not scale back up when the CPU flag or the loss burst (an F5) goes away.
// Bitrate still adapts via maxBitrate; resolution is a separate, explicit
// scale from the captured frame (see scaleResolutionToTarget).
export function getDegradationPreference(
  _contentHint: ShareContentHint,
  _networkScale: number,
  _cpuConstrained = false,
): SenderEncoding["degradationPreference"] {
  return "maintain-resolution";
}

export function targetEncodeHeight(
  profile: ShareQualityProfile,
  mode: ShareQualityMode,
): number {
  if (mode === "economy") {
    return Math.min(profile.captureHeight, SHARE_QUALITY.economy.targetHeight);
  }
  return Math.min(profile.captureHeight, 1080);
}

// Encode scale for a capture that is taller than the target. Never upscales.
// A few pixels of slack avoids 1088-vs-1080 turning into a soft rescale.
export function scaleResolutionToTarget(
  captureHeight: number,
  targetHeight: number,
): number {
  if (
    !Number.isFinite(captureHeight) ||
    !Number.isFinite(targetHeight) ||
    captureHeight <= 0 ||
    targetHeight <= 0 ||
    captureHeight <= targetHeight + 8
  ) {
    return 1;
  }
  return Number(Math.min(8, captureHeight / targetHeight).toFixed(2));
}

// Final per-sender encoding. Resolution is whatever the caller put on the
// profile (viewer mode, or the capture-to-target scale). A weak link lowers
// bitrate only.
export function getSenderEncoding(
  profile: ShareQualityProfile,
  networkScale: number,
  contentHint: ShareContentHint,
  cpuConstrained = false,
): SenderEncoding {
  return {
    maxBitrate: profile.maxBitratePerPeer,
    maxFramerate: profile.maxFramerate,
    scaleResolutionDownBy: profile.scaleResolutionDownBy ?? 1,
    degradationPreference: getDegradationPreference(
      contentHint,
      networkScale,
      cpuConstrained,
    ),
  };
}

export type NetworkAdaptState = {
  scale: number;
  constrainedSamples: number;
  stableSamples: number;
};

export type NetworkAdaptResult = NetworkAdaptState & {
  changed: boolean;
  constrained: boolean;
  severe: boolean;
};

// Decides how the network scale moves for one stats sample. Loss/RTT must stay
// bad for 2 consecutive samples to degrade; recovery needs a few clean samples
// (+0.1 every 5 samples, ~10s) so a short hiccup does not leave the picture
// soft for minutes.
export function evaluateNetworkSample(
  state: NetworkAdaptState,
  loss: number,
  rttSeconds: number,
): NetworkAdaptResult {
  const severe = loss > 0.1 || rttSeconds > 0.7;
  const constrained = severe || loss > 0.05 || rttSeconds > 0.45;
  let { scale, constrainedSamples, stableSamples } = state;
  let changed = false;
  if (constrained) {
    stableSamples = 0;
    constrainedSamples += 1;
    if (constrainedSamples >= 2) {
      constrainedSamples = 0;
      scale = Math.max(MIN_NETWORK_SCALE, scale - (severe ? 0.2 : 0.1));
      changed = true;
    }
    return { scale, constrainedSamples, stableSamples, changed, constrained, severe };
  }
  constrainedSamples = 0;
  stableSamples += 1;
  if (stableSamples >= SHARE_QUALITY.recoveryStableSamples && scale < 1) {
    scale = Math.min(1, Number((scale + SHARE_QUALITY.recoveryStep).toFixed(2)));
    stableSamples = 0;
    changed = true;
  }
  return { scale, constrainedSamples, stableSamples, changed, constrained, severe };
}

export type CpuAdaptState = {
  constrained: boolean;
  limitedSamples: number;
  cleanSamples: number;
};

// Tracks the encoder's "cpu" quality limitation. Only CPU is used here: the
// "bandwidth" flag is reported even on healthy streams and is handled by the
// loss/RTT logic above.
export function evaluateCpuSample(
  state: CpuAdaptState,
  cpuLimited: boolean,
): CpuAdaptState & { changed: boolean } {
  let { constrained, limitedSamples, cleanSamples } = state;
  let changed = false;
  if (cpuLimited) {
    cleanSamples = 0;
    limitedSamples += 1;
    if (!constrained && limitedSamples >= SHARE_QUALITY.cpuLimitedSamplesToAdapt) {
      constrained = true;
      changed = true;
    }
  } else {
    limitedSamples = 0;
    cleanSamples += 1;
    if (constrained && cleanSamples >= SHARE_QUALITY.cpuCleanSamplesToRecover) {
      constrained = false;
      cleanSamples = 0;
      changed = true;
    }
  }
  return { constrained, limitedSamples, cleanSamples, changed };
}

export type ConnectionQuality =
  | "idle"
  | "good"
  | "adjusting"
  | "poor"
  | "reconnecting";

export function qualityFromScale(scale: number): ConnectionQuality {
  return scale < 0.95 ? "adjusting" : "good";
}

export type CodecLike = { mimeType: string; sdpFmtpLine?: string };

// Rank for hardware-friendly ordering: H.264 constrained baseline first, then
// other H.264 profiles, VP9, VP8, AV1, unknown codecs, and finally the
// retransmission/redundancy pseudo-codecs.
export function rankVideoCodec(codec: CodecLike): number {
  const mime = codec.mimeType.toLowerCase();
  if (mime === "video/h264") {
    return /profile-level-id=42e0/i.test(codec.sdpFmtpLine ?? "") ? 0 : 1;
  }
  if (mime === "video/vp9") return 2;
  if (mime === "video/vp8") return 3;
  if (mime === "video/av1") return 4;
  if (
    mime === "video/rtx" ||
    mime === "video/red" ||
    mime === "video/ulpfec" ||
    mime === "video/flexfec-03"
  ) {
    return 6;
  }
  return 5;
}

// Stable sort: codecs with the same rank keep the browser's own order.
export function sortVideoCodecs<T extends CodecLike>(codecs: T[]): T[] {
  return codecs
    .map((codec, index) => ({ codec, index }))
    .sort((a, b) => rankVideoCodec(a.codec) - rankVideoCodec(b.codec) || a.index - b.index)
    .map((item) => item.codec);
}

// Applies the codec order to the video transceivers of a connection. Never
// throws: unsupported APIs leave the browser defaults untouched.
export function applyVideoCodecPreferences(pc: RTCPeerConnection): void {
  try {
    const capabilities = (
      RTCRtpSender as unknown as {
        getCapabilities?: (kind: string) => RTCRtpCapabilities | null;
      }
    ).getCapabilities?.("video");
    if (!capabilities?.codecs?.length) {
      return;
    }
    const sorted = sortVideoCodecs(capabilities.codecs);
    pc.getTransceivers().forEach((transceiver) => {
      if (
        transceiver.sender.track?.kind !== "video" ||
        typeof transceiver.setCodecPreferences !== "function"
      ) {
        return;
      }
      try {
        transceiver.setCodecPreferences(sorted);
      } catch (e) {
        console.warn("screenshare: codec preferences not applied", e);
      }
    });
  } catch (e) {
    console.warn("screenshare: codec preferences unavailable", e);
  }
}
