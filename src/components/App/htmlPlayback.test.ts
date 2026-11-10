import { describe, expect, it, vi } from "vitest";
import { applyHtmlSrcAndTime, initialSeekTime } from "./htmlPlayback";

describe("htmlPlayback", () => {
  it("sets src before seeking and waits for metadata when needed", () => {
    const listeners: Array<() => void> = [];
    const video = {
      src: "",
      currentTime: 0,
      readyState: 0,
      duration: Number.NaN,
      addEventListener: (
        _type: "loadedmetadata",
        listener: () => void,
      ) => {
        listeners.push(listener);
      },
    };
    applyHtmlSrcAndTime(video, "https://example.com/a.mp4", 42);
    expect(video.src).toBe("https://example.com/a.mp4");
    expect(video.currentTime).toBe(0);
    video.readyState = 1;
    video.duration = 120;
    listeners.forEach((listener) => listener());
    expect(video.currentTime).toBe(42);
  });

  it("seeks immediately when metadata is already there", () => {
    const video = {
      src: "https://example.com/a.mp4",
      currentTime: 0,
      readyState: 2,
      duration: 90,
      addEventListener: vi.fn(),
    };
    applyHtmlSrcAndTime(video, "https://example.com/a.mp4", 15);
    expect(video.currentTime).toBe(15);
    expect(video.addEventListener).not.toHaveBeenCalled();
  });

  it("uses the host timestamp for the first HTML seek", () => {
    expect(initialSeekTime(33, false)).toBe(33);
    expect(initialSeekTime(0, false)).toBe(0);
    expect(initialSeekTime(-2, true)).toBe(-2);
  });

  it("does not invent 0 when the host timestamp is missing", () => {
    expect(initialSeekTime(Number.NaN, false)).toBeUndefined();
    expect(initialSeekTime(Number.NEGATIVE_INFINITY, false)).toBeUndefined();
  });
});
