import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "stars-theme";

/** Read the persisted theme; fall back to the OS preference, then light. */
function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* private mode: ignore and fall through to the OS preference */
  }
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : "light";
}

/**
 * Light/dark theme for the whole app (Phase 6).
 *
 * The `dark` class on <html> is the single source of truth — every surface
 * already pairs a light Tailwind utility with its `dark:` counterpart, so
 * flipping one class restyles header, panels, dialogs, toasts and
 * secondary screens consistently. The choice is persisted to localStorage
 * and re-applied on load by the inline script in index.html (no flash).
 *
 * @returns {{theme:"light"|"dark", isDark:boolean, toggleTheme:()=>void, setTheme:(t:"light"|"dark")=>void}}
 */
export default function useTheme() {
  const [theme, setThemeState] = useState("light");

  // Sync from storage once the component mounts (index.html already applied
  // the class before first paint; this just informs React of the value).
  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  // Keep the DOM class in sync whenever the theme changes (covers the toggle
  // and any programmatic setTheme call).
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setTheme = useCallback((next) => {
    const value = next === "dark" ? "dark" : "light";
    setThemeState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* private mode: the choice simply won't persist */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const value = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, value);
      } catch {
        /* private mode: the choice simply won't persist */
      }
      return value;
    });
  }, []);

  return { theme, isDark: theme === "dark", toggleTheme, setTheme };
}
