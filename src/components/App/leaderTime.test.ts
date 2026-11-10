import { describe, expect, it } from "vitest";
import { calculateMedian, leaderTimeFromMap } from "./leaderTime";

describe("leaderTimeFromMap", () => {
  it("returns NaN when the map is empty instead of -Infinity or 0", () => {
    expect(leaderTimeFromMap({}, 1)).toBeNaN();
    expect(leaderTimeFromMap({}, 5)).toBeNaN();
  });

  it("ignores non-finite timestamps", () => {
    expect(leaderTimeFromMap({ a: Number.NaN, b: Number.POSITIVE_INFINITY }, 2)).toBeNaN();
    expect(leaderTimeFromMap({ a: 12, b: Number.NaN }, 2)).toBe(12);
  });

  it("uses max for two peers and median for three+", () => {
    expect(leaderTimeFromMap({ a: 10, b: 40 }, 2)).toBe(40);
    expect(leaderTimeFromMap({ a: 10, b: 20, c: 30 }, 3)).toBe(20);
  });
});

describe("calculateMedian", () => {
  it("does not mutate the input", () => {
    const values = [3, 1, 2];
    expect(calculateMedian(values)).toBe(2);
    expect(values).toEqual([3, 1, 2]);
  });
});
