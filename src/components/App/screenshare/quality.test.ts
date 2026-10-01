import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyVideoCodecPreferences,
  evaluateNetworkSample,
  getAdaptiveProfile,
  getSenderEncoding,
  getShareContentHint,
  getShareQualityProfile,
  getViewerSenderProfile,
  normalizeShareQualityMode,
  rankVideoCodec,
  sortVideoCodecs,
  type NetworkAdaptState,
} from "./quality";

describe("getShareQualityProfile", () => {
  it("uses 1080p/30 at 4 Mbps for a single viewer", () => {
    expect(getShareQualityProfile(1)).toEqual({
      captureWidth: 1920,
      captureHeight: 1080,
      maxFramerate: 30,
      maxBitratePerPeer: 4_000_000,
    });
  });

  it("treats 0 or negative peers as 1", () => {
    expect(getShareQualityProfile(0)).toEqual(getShareQualityProfile(1));
    expect(getShareQualityProfile(-3)).toEqual(getShareQualityProfile(1));
  });

  it("falls back to 720p/30 at 3.5 Mbps cap for 2 viewers (4 Mbps budget each)", () => {
    const p = getShareQualityProfile(2);
    expect(p.maxBitratePerPeer).toBe(3_500_000);
    expect(p.captureHeight).toBe(1080);
  });

  it("drops to 720p and 540p/24 as the room grows", () => {
    const p4 = getShareQualityProfile(4);
    expect(p4.maxBitratePerPeer).toBe(2_500_000);
    expect(p4.captureHeight).toBe(720);
    expect(p4.captureWidth).toBe(1280);
    expect(p4.maxFramerate).toBe(30);
    const p9 = getShareQualityProfile(9);
    expect(p9.maxBitratePerPeer).toBe(1_555_556);
    expect(p9.captureHeight).toBe(720);
    const p12 = getShareQualityProfile(12);
    expect(p12.maxBitratePerPeer).toBe(1_200_000);
    expect(p12.captureHeight).toBe(540);
    expect(p12.captureWidth).toBe(960);
    expect(p12.maxFramerate).toBe(24);
  });

  it("never goes below the 1.2 Mbps floor and never exceeds the cap", () => {
    for (let peers = 1; peers <= 50; peers++) {
      const { maxBitratePerPeer } = getShareQualityProfile(peers);
      expect(maxBitratePerPeer).toBeGreaterThanOrEqual(1_200_000);
      expect(maxBitratePerPeer).toBeLessThanOrEqual(4_000_000);
    }
  });
});

describe("getViewerSenderProfile", () => {
  const base = getShareQualityProfile(1);

  it("auto keeps the base profile without downscale", () => {
    expect(getViewerSenderProfile(base, "auto")).toEqual({
      ...base,
      scaleResolutionDownBy: 1,
    });
  });

  it("economy targets 720p/24 with reduced bitrate", () => {
    const p = getViewerSenderProfile(base, "economy");
    expect(p.scaleResolutionDownBy).toBe(1.5);
    expect(p.maxFramerate).toBe(24);
    expect(p.maxBitratePerPeer).toBe(3_000_000);
  });

  it("high targets 1080p/30 with at least 4.5 Mbps", () => {
    const p = getViewerSenderProfile(base, "high");
    expect(p.scaleResolutionDownBy).toBe(1);
    expect(p.maxFramerate).toBe(30);
    expect(p.maxBitratePerPeer).toBe(5_400_000);
  });

  it("does not upscale when the capture is already smaller than the target", () => {
    const small = getShareQualityProfile(12);
    expect(getViewerSenderProfile(small, "high").scaleResolutionDownBy).toBe(1);
  });
});

describe("normalizeShareQualityMode", () => {
  it("accepts known values and falls back to auto", () => {
    expect(normalizeShareQualityMode("economy")).toBe("economy");
    expect(normalizeShareQualityMode("high")).toBe("high");
    expect(normalizeShareQualityMode("auto")).toBe("auto");
    expect(normalizeShareQualityMode("???")).toBe("auto");
    expect(normalizeShareQualityMode(undefined)).toBe("auto");
  });
});

describe("getShareContentHint", () => {
  const track = (displaySurface?: string) => ({
    getSettings: () => ({ displaySurface }),
  });

  it("defaults to motion for every display surface", () => {
    for (const surface of ["browser", "window", "monitor", undefined, "x"]) {
      expect(getShareContentHint(track(surface))).toBe("motion");
    }
  });

  it("is motion when there is no track or getSettings", () => {
    expect(getShareContentHint(undefined)).toBe("motion");
    expect(getShareContentHint({} as any)).toBe("motion");
  });

  it("honors an explicit override", () => {
    expect(getShareContentHint(track("browser"), "detail")).toBe("detail");
  });
});

describe("getAdaptiveProfile / getSenderEncoding", () => {
  const base = getShareQualityProfile(1);

  it("scales bitrate by the network scale and keeps a floor", () => {
    expect(getAdaptiveProfile(base, 1, "motion").maxBitratePerPeer).toBe(4_000_000);
    expect(getAdaptiveProfile(base, 0.5, "motion").maxBitratePerPeer).toBe(2_000_000);
    const tiny = { ...base, maxBitratePerPeer: 1_000_000 };
    expect(getAdaptiveProfile(tiny, 0.4, "motion").maxBitratePerPeer).toBe(700_000);
  });

  it("keeps 30 fps for motion, caps detail at 24 fps on a weak network", () => {
    expect(getAdaptiveProfile(base, 0.5, "motion").maxFramerate).toBe(30);
    expect(getAdaptiveProfile(base, 0.5, "detail").maxFramerate).toBe(24);
    expect(getAdaptiveProfile(base, 0.9, "detail").maxFramerate).toBe(30);
  });

  it("chooses degradationPreference from the content hint", () => {
    const p = getAdaptiveProfile(base, 1, "motion");
    expect(getSenderEncoding(p, 1, "motion").degradationPreference).toBe(
      "maintain-framerate",
    );
    expect(getSenderEncoding(p, 1, "detail").degradationPreference).toBe(
      "maintain-resolution",
    );
  });

  it("adds a resolution downscale when the network is weak", () => {
    const p = { ...base, scaleResolutionDownBy: 1 };
    expect(getSenderEncoding(p, 1, "motion").scaleResolutionDownBy).toBe(1);
    expect(getSenderEncoding(p, 0.69, "motion").scaleResolutionDownBy).toBe(1.5);
    expect(getSenderEncoding(p, 0.49, "motion").scaleResolutionDownBy).toBe(2);
  });

  it("never reduces a downscale already requested by the viewer mode", () => {
    const p = { ...base, scaleResolutionDownBy: 3 };
    expect(getSenderEncoding(p, 0.4, "motion").scaleResolutionDownBy).toBe(3);
  });
});

describe("evaluateNetworkSample", () => {
  const fresh: NetworkAdaptState = {
    scale: 1,
    constrainedSamples: 0,
    stableSamples: 0,
  };

  it("does not degrade on a single bad sample", () => {
    const r = evaluateNetworkSample(fresh, 0.06, 0.1);
    expect(r.changed).toBe(false);
    expect(r.constrained).toBe(true);
    expect(r.scale).toBe(1);
    expect(r.constrainedSamples).toBe(1);
  });

  it("degrades by 0.1 after two consecutive samples above 5% loss", () => {
    const first = evaluateNetworkSample(fresh, 0.06, 0.1);
    const second = evaluateNetworkSample(first, 0.06, 0.1);
    expect(second.changed).toBe(true);
    expect(second.severe).toBe(false);
    expect(second.scale).toBeCloseTo(0.9);
    expect(second.constrainedSamples).toBe(0);
  });

  it("degrades by 0.2 when loss > 10% or RTT > 700 ms", () => {
    let r = evaluateNetworkSample(fresh, 0.11, 0);
    r = evaluateNetworkSample(r, 0.11, 0);
    expect(r.severe).toBe(true);
    expect(r.scale).toBeCloseTo(0.8);
    let h = evaluateNetworkSample(fresh, 0, 0.8);
    h = evaluateNetworkSample(h, 0, 0.8);
    expect(h.scale).toBeCloseTo(0.8);
  });

  it("treats RTT above 450 ms as constrained (not severe)", () => {
    const r = evaluateNetworkSample(fresh, 0, 0.5);
    expect(r.constrained).toBe(true);
    expect(r.severe).toBe(false);
  });

  it("never goes below the minimum scale", () => {
    let state: NetworkAdaptState = { ...fresh, scale: 0.45 };
    for (let i = 0; i < 10; i++) {
      const r = evaluateNetworkSample(state, 0.5, 0);
      state = r;
    }
    expect(state.scale).toBeCloseTo(0.4);
  });

  it("a good sample resets the constrained streak", () => {
    const bad = evaluateNetworkSample(fresh, 0.06, 0);
    const good = evaluateNetworkSample(bad, 0.01, 0.05);
    expect(good.constrainedSamples).toBe(0);
    const bad2 = evaluateNetworkSample(good, 0.06, 0);
    expect(bad2.changed).toBe(false);
  });

  it("recovers slowly: +0.05 only after 6 clean samples", () => {
    let state: NetworkAdaptState = { ...fresh, scale: 0.7 };
    for (let i = 0; i < 5; i++) {
      const r = evaluateNetworkSample(state, 0.01, 0.05);
      expect(r.changed).toBe(false);
      state = r;
    }
    const r = evaluateNetworkSample(state, 0.01, 0.05);
    expect(r.changed).toBe(true);
    expect(r.scale).toBeCloseTo(0.75);
    expect(r.stableSamples).toBe(0);
  });

  it("does not exceed scale 1 when recovering", () => {
    let state: NetworkAdaptState = { ...fresh, scale: 0.98 };
    for (let i = 0; i < 6; i++) {
      state = evaluateNetworkSample(state, 0, 0);
    }
    expect(state.scale).toBe(1);
    const again = evaluateNetworkSample({ ...state, stableSamples: 5 }, 0, 0);
    expect(again.changed).toBe(false);
  });
});

describe("video codec ordering", () => {
  const codecs = [
    { mimeType: "video/VP8" },
    { mimeType: "video/rtx" },
    { mimeType: "video/VP9", sdpFmtpLine: "profile-id=0" },
    {
      mimeType: "video/H264",
      sdpFmtpLine:
        "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f",
    },
    { mimeType: "video/AV1" },
    {
      mimeType: "video/H264",
      sdpFmtpLine:
        "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
    },
    { mimeType: "video/red" },
    { mimeType: "video/foo" },
  ];

  it("ranks constrained-baseline H.264 first, then H.264, VP9, VP8, AV1", () => {
    const ordered = sortVideoCodecs(codecs).map((c) => c.sdpFmtpLine ?? c.mimeType);
    expect(ordered.slice(0, 6)).toEqual([
      "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
      "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f",
      "profile-id=0",
      "video/VP8",
      "video/AV1",
      "video/foo",
    ]);
    expect(ordered.slice(6)).toEqual(["video/rtx", "video/red"]);
  });

  it("is stable and does not mutate its input", () => {
    const copy = JSON.stringify(codecs);
    const a = sortVideoCodecs(codecs);
    expect(JSON.stringify(codecs)).toBe(copy);
    expect(a).toHaveLength(codecs.length);
    const twoH264 = [
      { mimeType: "video/H264", sdpFmtpLine: "a=1" },
      { mimeType: "video/H264", sdpFmtpLine: "a=2" },
    ];
    expect(sortVideoCodecs(twoH264).map((c) => c.sdpFmtpLine)).toEqual([
      "a=1",
      "a=2",
    ]);
  });

  it("ranks unknown mime types between AV1 and the helper codecs", () => {
    expect(rankVideoCodec({ mimeType: "video/foo" })).toBe(5);
    expect(rankVideoCodec({ mimeType: "VIDEO/ULPFEC" })).toBe(6);
  });
});

describe("applyVideoCodecPreferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const makeTransceiver = (kind: string) => ({
    sender: { track: { kind } },
    setCodecPreferences: vi.fn(),
  });

  it("applies the sorted list to video transceivers only", () => {
    const caps = {
      codecs: [
        { mimeType: "video/VP8" },
        { mimeType: "video/H264", sdpFmtpLine: "profile-level-id=42e01f" },
      ],
    };
    vi.stubGlobal("RTCRtpSender", { getCapabilities: () => caps });
    const video = makeTransceiver("video");
    const audio = makeTransceiver("audio");
    applyVideoCodecPreferences({
      getTransceivers: () => [video, audio],
    } as unknown as RTCPeerConnection);
    expect(video.setCodecPreferences).toHaveBeenCalledTimes(1);
    expect(video.setCodecPreferences.mock.calls[0][0][0].mimeType).toBe(
      "video/H264",
    );
    expect(audio.setCodecPreferences).not.toHaveBeenCalled();
  });

  it("does nothing (and does not throw) when capabilities are unavailable", () => {
    vi.stubGlobal("RTCRtpSender", {});
    const video = makeTransceiver("video");
    expect(() =>
      applyVideoCodecPreferences({
        getTransceivers: () => [video],
      } as unknown as RTCPeerConnection),
    ).not.toThrow();
    expect(video.setCodecPreferences).not.toHaveBeenCalled();
    vi.stubGlobal("RTCRtpSender", { getCapabilities: () => null });
    applyVideoCodecPreferences({
      getTransceivers: () => [video],
    } as unknown as RTCPeerConnection);
    expect(video.setCodecPreferences).not.toHaveBeenCalled();
  });

  it("swallows errors thrown by setCodecPreferences", () => {
    vi.stubGlobal("RTCRtpSender", {
      getCapabilities: () => ({ codecs: [{ mimeType: "video/VP8" }] }),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const video = makeTransceiver("video");
    video.setCodecPreferences.mockImplementation(() => {
      throw new Error("unsupported");
    });
    expect(() =>
      applyVideoCodecPreferences({
        getTransceivers: () => [video],
      } as unknown as RTCPeerConnection),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does nothing when RTCRtpSender does not exist", () => {
    vi.stubGlobal("RTCRtpSender", undefined);
    expect(() =>
      applyVideoCodecPreferences({
        getTransceivers: () => [],
      } as unknown as RTCPeerConnection),
    ).not.toThrow();
  });
});
