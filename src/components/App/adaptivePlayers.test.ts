import { describe, expect, it, vi } from "vitest";
import { releaseAdaptivePlayers } from "./adaptivePlayers";

describe("releaseAdaptivePlayers", () => {
  it("stops and detaches HLS and resets DASH", () => {
    const hls = { stopLoad: vi.fn(), detachMedia: vi.fn() };
    const dash = { reset: vi.fn() };
    releaseAdaptivePlayers({ hls, dash });
    expect(hls.stopLoad).toHaveBeenCalledOnce();
    expect(hls.detachMedia).toHaveBeenCalledOnce();
    expect(dash.reset).toHaveBeenCalledOnce();
  });

  it("ignores missing players and thrown teardown", () => {
    expect(() => releaseAdaptivePlayers({})).not.toThrow();
    expect(() =>
      releaseAdaptivePlayers({
        hls: {
          stopLoad: () => {
            throw new Error("gone");
          },
        },
      }),
    ).not.toThrow();
  });
});
