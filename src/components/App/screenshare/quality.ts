import type {
  ShareContentHint,
  ShareQualityMode,
  ShareQualityProfile,
  SenderEncoding,
} from "./types";

export const MIN_NETWORK_SCALE = 0.4;
export const MIN_PEER_BITRATE = 700_000;

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

// Conservative defaults: a movie share to one or two people is more stable at
// ~3.5-4 Mbps than at 6 Mbps (tablets and home uplinks stall when the sender
// probes higher). Larger rooms split a smaller total budget.
export function getShareQualityProfile(peerCount: number): ShareQualityProfile {
  const peers = Math.max(1, peerCount);
  const totalBitrateBudget =
    peers <= 2
      ? 8_000_000
      : peers <= 4
        ? 10_000_000
        : peers <= 8
          ? 12_000_000
          : 14_000_000;
  const perPeerCap = peers <= 1 ? 4_000_000 : 3_500_000;
  const maxBitratePerPeer = Math.round(
    Math.max(1_200_000, Math.min(perPeerCap, totalBitrateBudget / peers)),
  );
  // Keep a 1080p source only while the budget supports it; otherwise use
  // 720p/30, which holds frame rate much better on weak links.
  let captureHeight = 1080;
  if (maxBitratePerPeer < 3_500_000) {
    captureHeight = 720;
  }
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
}

// Movies are the main use case, so every surface defaults to "motion".
// "detail" is only used for an explicit text/UI override.
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
    // For "motion" (movies) keep the frame rate and let the encoder lower
    // resolution instead; only "detail" content trades frames for pixels.
    maxFramerate:
      contentHint === "detail" && networkScale < 0.7
        ? Math.min(24, baseProfile.maxFramerate)
        : baseProfile.maxFramerate,
    maxBitratePerPeer: Math.max(
      MIN_PEER_BITRATE,
      Math.round(baseProfile.maxBitratePerPeer * networkScale),
    ),
  };
}

// Final per-sender encoding. When the network is clearly struggling the
// picture is also shrunk, because "maintain-resolution" alone only drops
// frames. The degradation preference follows the content hint.
export function getSenderEncoding(
  profile: ShareQualityProfile,
  networkScale: number,
  contentHint: ShareContentHint,
): SenderEncoding {
  return {
    maxBitrate: profile.maxBitratePerPeer,
    maxFramerate: profile.maxFramerate,
    scaleResolutionDownBy: Math.max(
      profile.scaleResolutionDownBy ?? 1,
      networkScale < 0.5 ? 2 : networkScale < 0.7 ? 1.5 : 1,
    ),
    degradationPreference:
      contentHint === "detail" ? "maintain-resolution" : "maintain-framerate",
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
// bad for 2 consecutive samples to degrade; recovery needs 6 clean samples and
// is slower (+0.05) than degradation (-0.1 / -0.2 when severe).
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
  if (stableSamples >= 6 && scale < 1) {
    scale = Math.min(1, scale + 0.05);
    stableSamples = 0;
    changed = true;
  }
  return { scale, constrainedSamples, stableSamples, changed, constrained, severe };
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
