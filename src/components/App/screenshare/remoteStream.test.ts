import { describe, expect, it } from "vitest";
import {
  collectRemoteShareTracks,
  needsRemoteShareReattach,
  remoteAudioLooksStalled,
  shareAudioNeedsResync,
} from "./remoteStream";

const track = (
  id: string,
  kind: "audio" | "video",
  readyState: MediaStreamTrackState = "live",
) => ({ id, kind, readyState });

describe("collectRemoteShareTracks", () => {
  it("merges current tracks, ontrack streams and the incoming track", () => {
    const video = track("v", "video");
    const audio = track("a", "audio");
    const result = collectRemoteShareTracks(
      [video],
      [{ getTracks: () => [video, audio] }],
      audio,
    );
    expect(result.map((t) => t.id)).toEqual(["v", "a"]);
  });

  it("drops ended tracks and keeps video first", () => {
    const result = collectRemoteShareTracks(
      [track("old", "audio", "ended"), track("a", "audio")],
      undefined,
      track("v", "video"),
    );
    expect(result.map((t) => t.id)).toEqual(["v", "a"]);
  });
});

describe("needsRemoteShareReattach", () => {
  it("reattaches when a late audio track appears", () => {
    expect(
      needsRemoteShareReattach(new Set(["v"]), [
        track("v", "video"),
        track("a", "audio"),
      ]),
    ).toBe(true);
  });

  it("keeps the element untouched when nothing changed", () => {
    expect(
      needsRemoteShareReattach(new Set(["v", "a"]), [
        track("v", "video"),
        track("a", "audio"),
      ]),
    ).toBe(false);
  });

  it("reattaches when a track was removed", () => {
    expect(
      needsRemoteShareReattach(new Set(["v", "a"]), [track("v", "video")]),
    ).toBe(true);
  });
});

describe("remoteAudioLooksStalled", () => {
  it("treats a paused element as stalled", () => {
    expect(remoteAudioLooksStalled(true, 1, 2)).toBe(true);
  });

  it("detects counters that stopped advancing", () => {
    expect(remoteAudioLooksStalled(false, 480, 480)).toBe(true);
    expect(remoteAudioLooksStalled(false, 480, 9_600)).toBe(false);
  });

  it("does not guess when stats are unavailable", () => {
    expect(remoteAudioLooksStalled(false, undefined, undefined)).toBe(false);
  });
});

describe("shareAudioNeedsResync", () => {
  it("waits until a video track exists", () => {
    expect(
      shareAudioNeedsResync({
        hasLiveVideo: false,
        hasLiveAudio: false,
        paused: false,
        samplesBefore: undefined,
        samplesAfter: undefined,
      }),
    ).toBe("wait");
  });

  it("asks for a resend when video is live and audio never arrived", () => {
    expect(
      shareAudioNeedsResync({
        hasLiveVideo: true,
        hasLiveAudio: false,
        paused: true,
        samplesBefore: undefined,
        samplesAfter: undefined,
      }),
    ).toBe("resync");
  });

  it("does not treat a paused element with an audio track as a dead sender", () => {
    expect(
      shareAudioNeedsResync({
        hasLiveVideo: true,
        hasLiveAudio: true,
        paused: true,
        samplesBefore: 10,
        samplesAfter: 10,
      }),
    ).toBe("wait");
  });

  it("asks for a resend when playing audio counters freeze", () => {
    expect(
      shareAudioNeedsResync({
        hasLiveVideo: true,
        hasLiveAudio: true,
        paused: false,
        samplesBefore: 100,
        samplesAfter: 100,
      }),
    ).toBe("resync");
    expect(
      shareAudioNeedsResync({
        hasLiveVideo: true,
        hasLiveAudio: true,
        paused: false,
        samplesBefore: 100,
        samplesAfter: 500,
      }),
    ).toBe("ok");
  });
});
