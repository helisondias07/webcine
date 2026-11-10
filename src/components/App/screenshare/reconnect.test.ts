import { describe, expect, it } from "vitest";
import {
  iceRestartDelay,
  recreateDelay,
  sanitizeOfferSdp,
  viewerConnectionReplaced,
} from "./reconnect";

describe("reconnect backoff", () => {
  it("restarts ICE after 4s, 8s, then 15s", () => {
    expect([0, 1, 2, 3, 10].map(iceRestartDelay)).toEqual([
      4_000, 8_000, 15_000, 15_000, 15_000,
    ]);
  });

  it("recreates connections with a doubling delay capped at 15s", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(recreateDelay)).toEqual([
      1_500, 3_000, 6_000, 12_000, 15_000, 15_000, 15_000,
    ]);
  });
});

describe("viewerConnectionReplaced", () => {
  it("is a new page only when both epochs are known and different", () => {
    expect(viewerConnectionReplaced(undefined, 1)).toBe(false);
    expect(viewerConnectionReplaced(1, undefined)).toBe(false);
    expect(viewerConnectionReplaced(1, 1)).toBe(false);
    expect(viewerConnectionReplaced(1, 2)).toBe(true);
    expect(viewerConnectionReplaced(4, 1)).toBe(true);
  });
});

describe("sanitizeOfferSdp", () => {
  it("removes a=extmap-allow-mixed and keeps other lines", () => {
    const sdp = "v=0\na=extmap-allow-mixed\na=group:BUNDLE 0\n";
    expect(sanitizeOfferSdp(sdp)).toBe("v=0\na=group:BUNDLE 0\n");
  });

  it("tolerates CRLF lines", () => {
    const out = sanitizeOfferSdp("v=0\r\na=extmap-allow-mixed\r\nm=video\r\n");
    expect(out).not.toContain("extmap-allow-mixed");
    expect(out).toContain("m=video");
  });
});
