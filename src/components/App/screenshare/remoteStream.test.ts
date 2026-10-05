import { describe, expect, it } from "vitest";
import {
  collectRemoteShareTracks,
  needsRemoteShareReattach,
  remoteAudioLooksStalled,
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
