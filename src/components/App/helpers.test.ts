import { describe, expect, it } from "vitest";
import {
  getDisplayInitials,
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
