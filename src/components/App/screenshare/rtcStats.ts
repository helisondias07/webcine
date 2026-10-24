export type RtcTransport = "relay" | "p2p" | "unknown";

export type RtcStatsSummary = {
  worstLoss: number;
  worstRtt: number;
  totalBytesSent: number;
  videoWidth: number;
  videoHeight: number;
  framesPerSecond: number;
  transport: RtcTransport;
  // True when an outbound video encoder reports qualityLimitationReason "cpu".
  cpuLimited: boolean;
  outboundFramesEncoded: number;
  inboundFreezeCount: number;
  inboundPacketsLost: number;
  inboundPacketsReceived: number;
};

export function emptyRtcStatsSummary(): RtcStatsSummary {
  return {
    worstLoss: 0,
    worstRtt: 0,
    totalBytesSent: 0,
    videoWidth: 0,
    videoHeight: 0,
    framesPerSecond: 0,
    transport: "unknown",
    cpuLimited: false,
    outboundFramesEncoded: 0,
    inboundFreezeCount: 0,
    inboundPacketsLost: 0,
    inboundPacketsReceived: 0,
  };
}

// Folds one RTCStats report into the running summary (mutates and returns it).
export function accumulateRtcReport(
  summary: RtcStatsSummary,
  report: any,
): RtcStatsSummary {
  if (report.type === "remote-inbound-rtp" && report.kind === "video") {
    summary.worstLoss = Math.max(
      summary.worstLoss,
      Number(report.fractionLost ?? 0),
    );
    summary.worstRtt = Math.max(
      summary.worstRtt,
      Number(report.roundTripTime ?? 0),
    );
  }
  if (
    (report.type === "outbound-rtp" || report.type === "inbound-rtp") &&
    report.kind === "video"
  ) {
    if (report.type === "outbound-rtp") {
      summary.totalBytesSent += Number(report.bytesSent ?? 0);
      summary.outboundFramesEncoded += Number(report.framesEncoded ?? 0);
      if (report.qualityLimitationReason === "cpu") {
        summary.cpuLimited = true;
      }
    }
    if (report.type === "inbound-rtp") {
      summary.inboundFreezeCount = Math.max(
        summary.inboundFreezeCount,
        Number(report.freezeCount ?? 0),
      );
      summary.inboundPacketsLost += Number(report.packetsLost ?? 0);
      summary.inboundPacketsReceived += Number(report.packetsReceived ?? 0);
    }
    summary.videoWidth = Math.max(
      summary.videoWidth,
      Number(report.frameWidth ?? 0),
    );
    summary.videoHeight = Math.max(
      summary.videoHeight,
      Number(report.frameHeight ?? 0),
    );
    summary.framesPerSecond = Math.max(
      summary.framesPerSecond,
      Number(report.framesPerSecond ?? 0),
    );
  }
  if (
    report.type === "candidate-pair" &&
    report.state === "succeeded" &&
    (report.nominated || report.selected)
  ) {
    summary.transport = report.localCandidateType === "relay" ? "relay" : "p2p";
    summary.worstRtt = Math.max(
      summary.worstRtt,
      Number(report.currentRoundTripTime ?? 0),
    );
  }
  return summary;
}

export function computeBitrateKbps(
  bytesNow: number,
  bytesBefore: number,
  elapsedSeconds: number,
  hasPrevious: boolean,
): number {
  if (!hasPrevious || elapsedSeconds <= 0) {
    return 0;
  }
  return Math.max(
    0,
    Math.round(((bytesNow - bytesBefore) * 8) / elapsedSeconds / 1000),
  );
}
