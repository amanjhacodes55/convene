"use client";

import { CalendarClock, CheckCircle2, Clock, Copy, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { call } from "@/client/fetch";
import { Field } from "./kit";
import type { RoomInfo } from "./lobby";
import { Logo } from "./ui";

type Result = { id: string; name: string; email: string; status: "approved" | "pending" | "denied"; join_url: string; token: string };

/** Registration for a meeting that requires it: details in, a personal join link out. */
export function Register({ code }: { code: string }) {
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    call<RoomInfo>(`/api/rooms/${code}`).then(setInfo, (e) => setError(e.message));
  }, [code]);

  // Pending: check every few seconds until the host decides.
  useEffect(() => {
    if (result?.status !== "pending") return;
    const t = setInterval(async () => {
      const r = await call<{ status: Result["status"] }>(`/api/rooms/${code}/register?token=${encodeURIComponent(result.token)}`).catch(() => null);
      if (r && r.status !== "pending") setResult({ ...result, status: r.status });
    }, 4000);
    return () => clearInterval(t);
  }, [code, result]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await call<Result>(`/api/rooms/${code}/register`, "POST", { name, email, phone });
      try {
        localStorage.setItem(`convene:reg:${code}`, r.token);
        localStorage.setItem("convene:name", r.name);
      } catch {}
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const when = info?.scheduledFor ? new Date(info.scheduledFor).toLocaleString([], { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5 text-lg font-semibold">
          <Logo size={34} /> Convene
        </Link>
        <div className="card overflow-hidden">
          <div className="border-b border-line bg-[radial-gradient(ellipse_at_top_right,rgba(109,124,255,.18),transparent_60%)] p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent-ink">Meeting registration</p>
            <h1 className="mt-1 text-xl font-semibold">{info?.title ?? "…"}</h1>
            {when && (
              <p className="mt-2 flex items-center gap-2 text-sm text-ink-2">
                <CalendarClock size={15} /> {when}
              </p>
            )}
          </div>
          <div className="p-6">
            {info && !info.registration && !result ? (
              <p className="text-sm text-ink-2">
                This meeting doesn&apos;t need registration.{" "}
                <Link className="text-accent-ink underline" href={`/m/${code}`}>
                  Join it directly
                </Link>
                .
              </p>
            ) : result ? (
              result.status === "approved" ? (
                <div id="reg-approved">
                  <p className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 size={18} className="text-good" /> You&apos;re registered, {result.name.split(" ")[0]}
                  </p>
                  <p className="mt-1 text-sm text-ink-2">This is your personal link. Keep it to yourself: it lets you in as {result.email}.</p>
                  <div className="mt-4 flex items-center gap-1 rounded-xl border border-line bg-bg py-1 pl-3 pr-1">
                    <code className="min-w-0 flex-1 truncate font-mono text-xs">{result.join_url}</code>
                    <button
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raise hover:text-ink"
                      onClick={() => {
                        void navigator.clipboard?.writeText(result.join_url);
                        setCopied(true);
                      }}
                      aria-label="Copy link"
                    >
                      {copied ? <CheckCircle2 size={15} className="text-good" /> : <Copy size={15} />}
                    </button>
                  </div>
                  <a className="btn btn-primary mt-4 h-11 w-full" href={result.join_url} id="reg-join">
                    <Video size={17} /> Join the meeting
                  </a>
                </div>
              ) : result.status === "pending" ? (
                <div id="reg-pending">
                  <p className="flex items-center gap-2 font-semibold">
                    <Clock size={18} className="text-warn" /> Waiting for the host to approve you
                  </p>
                  <p className="mt-1 text-sm text-ink-2">Keep this page open: it updates when the host decides, and your join link appears here.</p>
                </div>
              ) : (
                <p className="font-semibold">The host declined this registration.</p>
              )
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <Field label="Full name">
                  <input className="input" id="reg-name" autoComplete="name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
                </Field>
                <Field label="Email">
                  <input className="input" id="reg-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </Field>
                <Field label={info?.registration?.requirePhone ? "Phone" : "Phone (optional)"}>
                  <input className="input" id="reg-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required={info?.registration?.requirePhone} />
                </Field>
                {error && <p className="text-sm text-danger">{error}</p>}
                <button className="btn btn-primary h-11 w-full" disabled={busy || !info} id="reg-submit">
                  {busy ? "Registering…" : "Register"}
                </button>
                <p className="text-xs text-muted">The host sees your name, email and phone, and who attended.</p>
              </form>
            )}
            {error && !result && !info && <p className="text-sm text-danger">{error}</p>}
          </div>
        </div>
      </div>
    </main>
  );
}
