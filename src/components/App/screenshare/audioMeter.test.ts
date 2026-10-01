import { describe, expect, it } from "vitest";
import { computeLevel, smoothLevel } from "./audioMeter";

describe("computeLevel", () => {
  it("is 0 for silence and for empty data", () => {
    expect(computeLevel(new Uint8Array(512).fill(128))).toBe(0);
    expect(computeLevel(new Uint8Array(0))).toBe(0);
  });

  it("is capped at 1 for a full-scale signal", () => {
    const data = new Uint8Array(512).map((_, i) => (i % 2 ? 255 : 0));
    expect(computeLevel(data)).toBe(1);
  });

  it("grows with the signal amplitude", () => {
    const quiet = new Uint8Array(512).map((_, i) => (i % 2 ? 133 : 123));
    const loud = new Uint8Array(512).map((_, i) => (i % 2 ? 170 : 86));
    expect(computeLevel(quiet)).toBeGreaterThan(0);
    expect(computeLevel(loud)).toBeGreaterThan(computeLevel(quiet));
  });
});

describe("smoothLevel", () => {
  it("attacks instantly and releases slowly", () => {
    expect(smoothLevel(0.2, 0.8)).toBe(0.8);
    expect(smoothLevel(0.8, 0.1)).toBeCloseTo(0.68);
  });
});
