import { describe, expect, it, vi } from "vitest";
import { tracksToPublish } from "./publish";

function fakeTrack(kind: "audio" | "video", readyState: MediaStreamTrackState = "live") {
  const clone = {
    kind,
    readyState: "live" as const,
    contentHint: "",
    clone: () => clone,
    stop: vi.fn(),
  };
  const track = {
    kind,
    readyState,
    contentHint: kind === "video" ? "motion" : "",
    clone: vi.fn(() => {
      clone.contentHint = track.contentHint;
      return clone;
    }),
    stop: vi.fn(),
  };
  return { track, clone };
}

describe("tracksToPublish", () => {
  it("clones one live video track and one live audio track, video first", () => {
    const video = fakeTrack("video");
    const audio = fakeTrack("audio");
    const ended = fakeTrack("audio", "ended");
    const published = tracksToPublish([
      ended.track as unknown as MediaStreamTrack,
      audio.track as unknown as MediaStreamTrack,
      video.track as unknown as MediaStreamTrack,
    ]);
    expect(published.map((item) => item.track.kind)).toEqual(["video", "audio"]);
    expect(published.every((item) => item.stopOnClose)).toBe(true);
    expect(video.clone.contentHint).toBe("motion");
    expect(video.track.stop).not.toHaveBeenCalled();
    expect(audio.track.stop).not.toHaveBeenCalled();
  });

  it("falls back to the original track when clone fails, and does not mark it for stop", () => {
    const track = {
      kind: "audio",
      readyState: "live",
      contentHint: "",
      clone: () => {
        throw new Error("clone failed");
      },
    };
    const published = tracksToPublish([track as unknown as MediaStreamTrack]);
    expect(published).toEqual([{ track, stopOnClose: false }]);
  });
});
