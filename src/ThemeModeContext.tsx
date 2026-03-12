import React from "react";

export type ThemeMode = "light" | "dark";

export interface ThemeModeContextValue {
  mode: ThemeMode;
  setMode: (value: ThemeMode) => void;
  toggleMode: () => void;
}

export const ThemeModeContext = React.createContext<ThemeModeContextValue>({
  mode: "dark",
  setMode: () => undefined,
  toggleMode: () => undefined,
});
