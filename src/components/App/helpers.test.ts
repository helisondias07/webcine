import { describe, expect, it } from "vitest";
import {
  getDisplayInitials,
  getReadableNameColor,
  getRelativeLuminance,
  normalizeDisplayName,
  normalizeNameColor,
  normalizeYouTubeQuality,
  toRgba,
} from "./helpers";

describe("helpers", () => {
  it("normalizes display names", () => {
    expect(normalizeDisplayName("  Ana   Maria  ")).toBe("Ana Maria");
    expect(normalizeDisplayName("x".repeat(60))).toHaveLength(40);
  });

  it("normalizes colors with a white fallback", () => {
    expect(normalizeNameColor("#ff00aa")).toBe("#FF00AA");
    expect(normalizeNameColor("red")).toBe("#FFFFFF");
    expect(normalizeNameColor(null)).toBe("#FFFFFF");
  });

  it("falls back to the theme text color for unreadable name colors", () => {
    // default white, invalid and empty values use the theme color
    expect(getReadableNameColor("#FFFFFF")).toBeUndefined();
    expect(getReadableNameColor("#ffffff")).toBeUndefined();
    expect(getReadableNameColor("red")).toBeUndefined();
    expect(getReadableNameColor("")).toBeUndefined();
    expect(getReadableNameColor(undefined)).toBeUndefined();
    // near-white and near-black would vanish on light / dark backgrounds
    expect(getReadableNameColor("#F8F8F0")).toBeUndefined();
    expect(getReadableNameColor("#050505")).toBeUndefined();
    // regular colors are kept (normalized to upper case)
    expect(getReadableNameColor("#e8590c")).toBe("#E8590C");
    expect(getReadableNameColor("#1C7ED6")).toBe("#1C7ED6");
    expect(getReadableNameColor("#FFD43B")).toBe("#FFD43B");
  });

  it("computes relative luminance", () => {
    expect(getRelativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(getRelativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(getRelativeLuminance("#808080")).toBeCloseTo(0.2159, 3);
  });

  it("builds initials and rgba strings", () => {
    expect(getDisplayInitials("Ana Maria Souza")).toBe("AS");
    expect(getDisplayInitials("ana")).toBe("AN");
    expect(getDisplayInitials("  ")).toBe("?");
    expect(toRgba("#FF0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("normalizes YouTube quality with an hd1080 fallback", () => {
    expect(normalizeYouTubeQuality(" HD720 ")).toBe("hd720");
    expect(normalizeYouTubeQuality("auto")).toBe("auto");
    expect(normalizeYouTubeQuality("bogus")).toBe("hd1080");
  });
});
