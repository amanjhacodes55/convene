import type { ReactNode } from "react";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="convene-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d7cff" />
          <stop offset="1" stopColor="#8f6dff" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#convene-logo)" />
      <rect x="6" y="10" width="14" height="12" rx="3.5" fill="#fff" />
      <path d="M21.5 14.2 26 11.5v9l-4.5-2.7z" fill="#fff" />
      <circle cx="13" cy="16" r="2.4" fill="#7a74ff" />
    </svg>
  );
}

const AVATAR_COLORS = ["#6d7cff", "#e26d9b", "#3ecf8e", "#f5a14a", "#4fb3e8", "#b57bff", "#ef6b5a", "#2fb5a5"];

/** A stable colour per name, so someone keeps their colour across tiles, chat and the roster. */
export function colorFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** Full-screen message for the moments outside a call: ended, left, removed, not found. */
export function Screen({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="card dialog-in w-full max-w-md p-8 text-center" style={{ boxShadow: "var(--shadow)" }}>
        <div className="mb-5 flex justify-center">
          <Logo size={40} />
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {children && <div className="mt-2 text-ink-2">{children}</div>}
        {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
      </div>
    </main>
  );
}
