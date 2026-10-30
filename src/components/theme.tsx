"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/client/theme";

/** A sun or moon that flips between light and dark, for headers. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolved, setTheme } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button
      className={`relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl text-ink-2 transition-colors hover:bg-raise hover:text-ink ${className}`}
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      id="theme-toggle"
    >
      <Sun size={18} className={`absolute transition-all duration-500 ${resolved === "light" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`} />
      <Moon size={17} className={`absolute transition-all duration-500 ${resolved === "dark" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0"}`} />
    </button>
  );
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Light, dark or follow the system, for settings. */
export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const at = OPTIONS.findIndex((o) => o.value === theme);
  return (
    <div className="relative grid grid-cols-3 rounded-xl border border-line bg-raise p-1" role="radiogroup" aria-label="Theme">
      <span
        className="absolute inset-y-1 left-1 rounded-lg bg-panel shadow-sm transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{ width: "calc((100% - 0.5rem) / 3)", transform: `translateX(${at * 100}%)` }}
        aria-hidden
      />
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={theme === o.value}
          className={`relative flex h-8 items-center justify-center gap-1.5 rounded-lg text-sm transition-colors ${theme === o.value ? "text-ink" : "text-muted hover:text-ink-2"}`}
          onClick={() => setTheme(o.value)}
          id={`theme-${o.value}`}
        >
          <o.icon size={15} /> {o.label}
        </button>
      ))}
    </div>
  );
}
