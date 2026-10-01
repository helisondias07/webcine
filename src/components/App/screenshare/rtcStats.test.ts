import { describe, expect, it } from "vitest";
import {
  accumulateRtcReport,
  computeBitrateKbps,
  emptyRtcStatsSummary,
} from "./rtcStats";

describe("accumulateRtcReport", () => {
  it("keeps the worst loss/RTT across reports", () => {
    const s = emptyRtcStatsSummary();
    accumulateRtcReport(s, {
      type: "remote-inbound-rtp",
      kind: "video",
      fractionLost: 0.02,
      roundTripTime: 0.1,
    });
    accumulateRtcReport(s, {
      type: "remote-inbound-rtp",
      kind: "video",
      fractionLost: 0.07,
      roundTripTime: 0.05,
    });
    expect(s.worstLoss).toBe(0.07);
    expect(s.worstRtt).toBe(0.1);
  });

  it("ignores audio reports for loss and sums sent bytes of outbound video", () => {
    const s = emptyRtcStatsSummary();
    accumulateRtcReport(s, {
      type: "remote-inbound-rtp",
      kind: "audio",
      fractionLost: 0.9,
    });
    accumulateRtcReport(s, {
      type: "outbound-rtp",
      kind: "video",
      bytesSent: 1000,
      frameWidth: 1920,
      frameHeight: 1080,
      framesPerSecond: 30,
    });
    accumulateRtcReport(s, {
      type: "outbound-rtp",
      kind: "video",
      bytesSent: 500,
    });
    expect(s.worstLoss).toBe(0);
    expect(s.totalBytesSent).toBe(1500);
    expect([s.videoWidth, s.videoHeight, s.framesPerSecond]).toEqual([
      1920, 1080, 30,
    ]);
  });

  it("reads resolution from inbound video without counting bytes sent", () => {
    const s = emptyRtcStatsSummary();
    accumulateRtcReport(s, {
      type: "inbound-rtp",
      kind: "video",
      bytesReceived: 9999,
      frameWidth: 1280,
      frameHeight: 720,
      framesPerSecond: 24,
    });
    expect(s.totalBytesSent).toBe(0);
    expect(s.videoHeight).toBe(720);
  });

  it("detects relay vs p2p from the selected candidate pair", () => {
    const relay = emptyRtcStatsSummary();
    accumulateRtcReport(relay, {
      type: "candidate-pair",
      state: "succeeded",
      nominated: true,
      localCandidateType: "relay",
    });
    expect(relay.transport).toBe("relay");
    const p2p = emptyRtcStatsSummary();
    accumulateRtcReport(p2p, {
      type: "candidate-pair",
      state: "succeeded",
      selected: true,
      localCandidateType: "srflx",
    });
    expect(p2p.transport).toBe("p2p");
    const none = emptyRtcStatsSummary();
    accumulateRtcReport(none, {
      type: "candidate-pair",
      state: "waiting",
      nominated: true,
    });
    expect(none.transport).toBe("unknown");
  });
});

describe("computeBitrateKbps", () => {
  it("computes kbps from the byte delta", () => {
    expect(computeBitrateKbps(2_500_000, 0, 2, true)).toBe(10_000);
  });
  it("returns 0 without a previous sample, with no time elapsed or on counter reset", () => {
    expect(computeBitrateKbps(1000, 0, 2, false)).toBe(0);
    expect(computeBitrateKbps(1000, 0, 0, true)).toBe(0);
    expect(computeBitrateKbps(100, 5000, 2, true)).toBe(0);
  });
});
