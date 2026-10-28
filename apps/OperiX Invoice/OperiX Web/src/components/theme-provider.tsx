"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark";
export type ThemePreference = ThemeMode | "system";

type ThemeContextValue = {
  theme: ThemeMode;
  preference: ThemePreference;
  setTheme: (theme: ThemeMode) => void;
  setPreference: (preference: ThemePreference) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const themeStorageKey = "operix-theme";

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const saved = window.localStorage.getItem(themeStorageKey);
  return saved === "dark" || saved === "light" ? saved : "system";
}

function systemTheme(): ThemeMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [system, setSystem] = useState<ThemeMode>("light");
  const [initialized, setInitialized] = useState(false);
  const theme: ThemeMode = preference === "system" ? system : preference;

  useEffect(() => {
    queueMicrotask(() => {
      setPreference(readPreference());
      setSystem(systemTheme());
      setInitialized(true);
    });
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(query.matches ? "dark" : "light");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    if (preference === "system") window.localStorage.removeItem(themeStorageKey);
    else window.localStorage.setItem(themeStorageKey, preference);
  }, [initialized, theme, preference]);

  const setTheme = useCallback((next: ThemeMode) => setPreference(next), []);
  const toggleTheme = useCallback(() => {
    setPreference(theme === "light" ? "dark" : "light");
  }, [theme]);

  const value = useMemo(() => ({ theme, preference, setTheme, setPreference, toggleTheme }), [theme, preference, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
