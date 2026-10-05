import { describe, expect, it } from "vitest";
import { shouldUseTouchLayout } from "./touchLayout";

describe("shouldUseTouchLayout", () => {
  it("treats phones as touch layout regardless of pointer", () => {
    expect(
      shouldUseTouchLayout({
        screenWidth: 390,
        screenHeight: 844,
        coarsePointer: true,
      }),
    ).toBe(true);
    expect(
      shouldUseTouchLayout({
        screenWidth: 360,
        screenHeight: 780,
        coarsePointer: false,
      }),
    ).toBe(true);
  });

  it("treats touch tablets as touch layout in both orientations", () => {
    for (const [w, h] of [
      [768, 1024],
      [820, 1180],
      [1180, 820],
      [1024, 1366],
      [1366, 1024],
    ]) {
      expect(
        shouldUseTouchLayout({
          screenWidth: w,
          screenHeight: h,
          coarsePointer: true,
        }),
      ).toBe(true);
    }
  });

  it("keeps desktops, touch laptops with a mouse and big touch screens on desktop", () => {
    expect(
      shouldUseTouchLayout({
        screenWidth: 1280,
        screenHeight: 800,
        coarsePointer: false,
      }),
    ).toBe(false);
    expect(
      shouldUseTouchLayout({
        screenWidth: 820,
        screenHeight: 1180,
        coarsePointer: false,
      }),
    ).toBe(false);
    expect(
      shouldUseTouchLayout({
        screenWidth: 1920,
        screenHeight: 1080,
        coarsePointer: true,
      }),
    ).toBe(false);
  });

  it("handles missing screen sizes", () => {
    expect(
      shouldUseTouchLayout({
        screenWidth: 0,
        screenHeight: 0,
        coarsePointer: true,
      }),
    ).toBe(false);
  });
});
