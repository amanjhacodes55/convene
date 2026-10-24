"use client";

import { ArrowRight, Keyboard, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Pulls a meeting code out of whatever was pasted: a code, or a full invite link. */
export function parseCode(input: string) {
  const m = input.trim().toLowerCase().match(/([a-z]{3})-?([a-z]{4})-?([a-z]{3})(?:[/?#]|$)/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function StartMeeting() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [waitingRoom, setWaitingRoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, waitingRoom }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      try {
        localStorage.setItem(`convene:host:${json.code}`, json.hostKey);
      } catch {}
      router.push(`/m/${json.code}`);
    } catch (e) {
      setError((e as Error).message || "Could not start a meeting.");
      setBusy(false);
    }
  }

  return (
    <form
      className="card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <label className="text-sm font-medium text-ink-2" htmlFor="title">
        Start a meeting
      </label>
      <input id="title" className="input mt-2" placeholder="Meeting name (optional)" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
      <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={waitingRoom} onChange={(e) => setWaitingRoom(e.target.checked)} />
        Use a waiting room: I&apos;ll let people in
      </label>
      <button className="btn btn-primary mt-4 h-11 w-full text-base" disabled={busy} id="new-meeting">
        <Video size={18} /> {busy ? "Starting…" : "New meeting"}
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </form>
  );
}

export function JoinMeeting() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const code = parseCode(value);
  return (
    <form
      className="card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (code) router.push(`/m/${code}`);
      }}
    >
      <label className="text-sm font-medium text-ink-2" htmlFor="code">
        Join a meeting
      </label>
      <div className="mt-2 flex gap-2">
        <div className="relative flex-1">
          <Keyboard size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input id="code" className="input pl-9" placeholder="Code or link, e.g. abc-defg-hij" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <button className="btn h-11" disabled={!code} aria-label="Join">
          Join <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
