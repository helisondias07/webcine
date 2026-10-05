import { describe, expect, it } from "vitest";
import {
  getDefaultThemeMode,
  hasExplicitThemeChoice,
  resolveThemeMode,
} from "./ThemeModeContext";

describe("theme mode defaults", () => {
  it("uses dark in rooms and light elsewhere", () => {
    expect(getDefaultThemeMode("/watch/abc")).toBe("dark");
    expect(getDefaultThemeMode("/r/minha-sala")).toBe("dark");
    expect(getDefaultThemeMode("/")).toBe("light");
    expect(getDefaultThemeMode("/create")).toBe("light");
    expect(getDefaultThemeMode("/watcher")).toBe("light");
  });

  it("keeps an explicit choice on every route", () => {
    expect(resolveThemeMode("light", true, "/watch/abc")).toBe("light");
    expect(resolveThemeMode("dark", false, "/")).toBe("dark");
    expect(resolveThemeMode("dark", true, "/watch/abc")).toBe("dark");
  });

  it("ignores the legacy auto-saved light value", () => {
    expect(resolveThemeMode("light", false, "/watch/abc")).toBe("dark");
    expect(resolveThemeMode("light", false, "/")).toBe("light");
    expect(resolveThemeMode(null, false, "/r/x")).toBe("dark");
    expect(resolveThemeMode("blue", true, "/")).toBe("light");
  });

  it("detects explicit choices", () => {
    expect(hasExplicitThemeChoice("dark", false)).toBe(true);
    expect(hasExplicitThemeChoice("light", true)).toBe(true);
    expect(hasExplicitThemeChoice("light", false)).toBe(false);
    expect(hasExplicitThemeChoice(null, true)).toBe(false);
  });
});
