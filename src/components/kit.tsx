"use client";

import { Check, Copy, Eye, EyeOff, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

// Small building blocks for the dashboard and the developer portal.

export function CopyField({ value, secret = false, label, id }: { value: string; secret?: boolean; label?: string; id?: string }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div>
      {label && <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{label}</div>}
      <div className="flex items-center gap-1 rounded-xl border border-line bg-bg py-1 pl-3 pr-1">
        <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink" id={id}>
          {shown ? value : "•".repeat(Math.min(32, value.length))}
        </code>
        {secret && (
          <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raise hover:text-ink" onClick={() => setShown(!shown)} aria-label={shown ? "Hide" : "Show"}>
            {shown ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
        <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raise hover:text-ink" onClick={copy} aria-label={`Copy ${label ?? "value"}`}>
          {copied ? <Check size={15} className="text-good" /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  );
}

const TONES = {
  neutral: "bg-raise text-ink-2",
  good: "bg-good/15 text-good",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
  accent: "bg-accent/20 text-accent-ink",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>{children}</span>;
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className={`card max-h-[90dvh] w-full overflow-y-auto p-6 shadow-2xl shadow-black/50 ${wide ? "max-w-2xl" : "max-w-md"}`} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-raise" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="scroll-thin flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          id={`tab-${t.id}`}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${value === t.id ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-raise text-accent-ink">{icon}</span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      {children && <div className="mt-1.5 max-w-sm text-sm text-ink-2">{children}</div>}
    </div>
  );
}

/** Pretty JSON with a little colour: keys, strings, numbers and literals. */
export function Json({ value, className = "" }: { value: unknown; className?: string }) {
  // Strings are shown as they are (shell commands, code); only JSON gets colour.
  if (typeof value === "string") return <pre className={`scroll-thin overflow-auto rounded-xl border border-line bg-bg p-4 font-mono text-[12.5px] leading-relaxed text-ink ${className}`}>{value}</pre>;
  const text = JSON.stringify(value, null, 2);
  const parts = text.split(/("(?:[^"\\]|\\.)*"(?=\s*:)|"(?:[^"\\]|\\.)*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/g);
  return (
    <pre className={`scroll-thin overflow-auto rounded-xl border border-line bg-bg p-4 font-mono text-[12.5px] leading-relaxed ${className}`}>
      {parts.map((p, i) => {
        if (i % 2 === 0) return p;
        const color = /^"/.test(p) ? (/^\s*:/.test(parts[i + 1] ?? "") ? "#9fb0ff" : "#8fd6a8") : /^(true|false|null)$/.test(p) ? "#f2a97f" : "#f5c97a";
        return (
          <span key={i} style={{ color }}>
            {p}
          </span>
        );
      })}
    </pre>
  );
}

export const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
};

const never = () => () => {};
/** Renders its children in the browser only, for pages that read the address bar as they start. */
export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const client = useSyncExternalStore(never, () => true, () => false);
  return client ? children : fallback;
}
