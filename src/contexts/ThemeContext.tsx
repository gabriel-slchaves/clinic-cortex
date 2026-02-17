import {
  DEFAULT_THEME,
  readStoredActiveTheme,
  type StoredTheme,
  writeStoredActiveTheme,
} from "@/lib/themeStorage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Theme = StoredTheme;

interface ThemeContextType {
  theme: Theme;
  setTheme?: (theme: Theme) => void;
  switchable: boolean;
  themes: Theme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

function isDarkTheme(theme: Theme) {
  return theme === "dark" || theme === "forest";
}

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
  switchable = false,
}: ThemeProviderProps) {
  const themes = useMemo(() => ["light", "dark", "forest", "emerald"] as Theme[], []);

  const [theme, setThemeState] = useState<Theme>(() => {
    if (switchable) {
      return readStoredActiveTheme() || defaultTheme;
    }
    return defaultTheme;
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDarkTheme(theme));
    root.setAttribute("data-cc-theme", theme);
    root.style.colorScheme = isDarkTheme(theme) ? "dark" : "light";

    if (switchable) writeStoredActiveTheme(theme);
  }, [theme, switchable]);

  const setThemeSafe = switchable ? (t: Theme) => setThemeState(t) : undefined;

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeSafe, switchable, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
