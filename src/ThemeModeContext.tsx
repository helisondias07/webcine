import React from "react";

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "webcinetv-theme-preference";
/** Set to "1" only when the user picks a theme with the toggle. */
export const THEME_EXPLICIT_KEY = "webcinetv-theme-explicit";

const ROOM_ROUTE = /^\/(watch|r)\//;

/** Default theme when the user never chose one: dark in rooms, light elsewhere. */
export function getDefaultThemeMode(pathname: string): ThemeMode {
  return ROOM_ROUTE.test(pathname) ? "dark" : "light";
}

/**
 * Older builds persisted the theme on every load (always "light" unless the
 * user switched), so a stored "light" only counts as a real choice when the
 * explicit flag is present. A stored "dark" was always a user choice.
 */
export function resolveThemeMode(
  stored: string | null | undefined,
  explicit: boolean,
  pathname: string,
): ThemeMode {
  if (stored === "dark") {
    return "dark";
  }
  if (stored === "light" && explicit) {
    return "light";
  }
  return getDefaultThemeMode(pathname);
}

export function hasExplicitThemeChoice(
  stored: string | null | undefined,
  explicit: boolean,
) {
  return stored === "dark" || (stored === "light" && explicit);
}

export interface ThemeModeContextValue {
  mode: ThemeMode;
  setMode: (value: ThemeMode) => void;
  toggleMode: () => void;
  /** Applies the route default (dark in rooms) while no explicit choice exists. */
  syncRouteDefault?: (pathname: string) => void;
}

export const ThemeModeContext = React.createContext<ThemeModeContextValue>({
  mode: "dark",
  setMode: () => undefined,
  toggleMode: () => undefined,
});
