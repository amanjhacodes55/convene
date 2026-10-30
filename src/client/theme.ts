"use client";

import { useSyncExternalStore } from "react";

/** What the user picked. "system" follows the operating system's light or dark setting. */
export type Theme = "light" | "dark" | "system";

const KEY = "convene:theme";
const listeners = new Set<() => void>();

function saved(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

/** Puts the resolved theme on <html>. The layout runs the same logic before first paint. */
function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && systemDark());
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#0b0d12" : "#f6f7fb"));
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {}
  // Colours ease across for a moment, then transitions go back to what each element asks for.
  const root = document.documentElement;
  root.classList.add("theme-shift");
  apply(theme);
  setTimeout(() => root.classList.remove("theme-shift"), 350);
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const media = matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (saved() === "system") apply("system");
    onChange();
  };
  media.addEventListener("change", onSystem);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onSystem);
  };
}

/** The picked theme, and the one showing ("light" or "dark"). */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, saved, () => "system" as Theme);
  const resolved = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    () => "dark" as const,
  );
  return { theme, resolved, setTheme };
}

