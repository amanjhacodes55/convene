"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { call } from "@/client/fetch";
import { Logo } from "./ui";

/** Only same-site paths, so ?next= can't send someone to another site after signing in. */
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/app");

export function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = safeNext(params.get("next"));

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await call(`/api/auth/${mode}`, "POST", { name, email, password });
      router.push(next);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const signup = mode === "signup";
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5 text-lg font-semibold">
          <Logo size={34} /> Convene
        </Link>
        <form
          className="card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h1 className="text-xl font-semibold">{signup ? "Create your account" : "Sign in"}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {signup ? "Schedule meetings, see who attended, and build on the Convene API." : "Welcome back."}
          </p>
          <div className="mt-5 space-y-3">
            {signup && (
              <label className="block text-sm text-ink-2">
                Your name
                <input id="su-name" className="input mt-1.5" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
            )}
            <label className="block text-sm text-ink-2">
              Email
              <input id="su-email" className="input mt-1.5" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="block text-sm text-ink-2">
              Password
              <input
                id="su-password"
                className="input mt-1.5"
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                minLength={signup ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          </div>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <button className="btn btn-primary mt-5 h-11 w-full" disabled={busy} id="su-submit">
            {busy ? "One moment…" : signup ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-ink-2">
          {signup ? "Already have an account?" : "New to Convene?"}{" "}
          <button className="text-accent-ink hover:underline" onClick={() => (setMode(signup ? "signin" : "signup"), setError(""))}>
            {signup ? "Sign in" : "Create an account"}
          </button>
        </p>
        <p className="mt-2 text-center text-xs text-muted">You never need an account to join or start a meeting.</p>
      </div>
    </main>
  );
}
