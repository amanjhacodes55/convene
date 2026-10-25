"use client";

import { ArrowLeftRight, Check, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { call } from "@/client/fetch";
import { Avatar, Logo } from "./ui";

type Info = {
  app: { name: string; description: string; createdAt: number };
  scopes: { scope: string; text: string }[];
  redirectHost: string;
  user: { name: string; email: string } | null;
};

const KEYS = ["response_type", "client_id", "redirect_uri", "scope", "state", "code_challenge", "code_challenge_method"];

/** The OAuth consent screen: who is asking, for what, and Allow or Cancel. */
export function Consent() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // From the router, not location: on a client-side navigation the address bar updates after render.
  const search = useSearchParams();
  const query = search.toString();
  const params = useMemo(() => Object.fromEntries([...new URLSearchParams(query)].filter(([k]) => KEYS.includes(k))), [query]);

  useEffect(() => {
    call<Info & { redirect?: string }>(`/api/oauth/authorize?${new URLSearchParams(params)}`).then(
      (r) => (r.redirect ? location.replace(r.redirect) : setInfo(r)),
      (e) => setError(e.message),
    );
  }, [params]);

  async function decide(decision: "allow" | "deny") {
    setBusy(true);
    try {
      const { redirect } = await call<{ redirect: string }>("/api/oauth/authorize", "POST", { ...params, decision });
      location.assign(redirect);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const next = `/oauth/authorize?${query}`;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        {error ? (
          <div className="card p-8 text-center">
            <div className="mb-4 flex justify-center">
              <Logo size={40} />
            </div>
            <h1 className="text-lg font-semibold">This authorization request can&apos;t continue</h1>
            <p className="mt-2 text-sm text-ink-2">{error}</p>
            <Link className="btn mt-6" href="/">
              Go to Convene
            </Link>
          </div>
        ) : !info ? (
          <div className="flex justify-center">
            <span className="animate-pulse">
              <Logo size={40} />
            </span>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="flex flex-col items-center px-8 pb-6 pt-8 text-center">
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#6d7cff] to-[#8f6dff] text-2xl font-semibold text-white">{info.app.name[0]?.toUpperCase()}</span>
                <ArrowLeftRight size={20} className="text-muted" />
                <Logo size={56} />
              </div>
              <h1 className="mt-5 text-xl font-semibold">
                <span className="text-accent-ink">{info.app.name}</span> wants to access your Convene account
              </h1>
              {info.app.description && <p className="mt-2 text-sm text-ink-2">{info.app.description}</p>}
            </div>
            {!info.user ? (
              <div className="border-t border-line p-6 text-center">
                <p className="text-sm text-ink-2">Sign in to choose whether to allow it.</p>
                <Link className="btn btn-primary mt-4 w-full" href={`/signin?next=${encodeURIComponent(next)}`} id="consent-signin">
                  Sign in to Convene
                </Link>
              </div>
            ) : (
              <>
                <div className="border-t border-line px-6 py-5">
                  <div className="mb-3 flex items-center gap-3 rounded-xl bg-raise px-3 py-2.5">
                    <Avatar name={info.user.name} size={32} />
                    <div className="min-w-0 text-sm">
                      <div className="truncate font-medium">{info.user.name}</div>
                      <div className="truncate text-xs text-ink-2">{info.user.email}</div>
                    </div>
                  </div>
                  <p className="text-sm font-medium">This will allow {info.app.name} to:</p>
                  <ul className="mt-3 space-y-2.5">
                    {info.scopes.map((s) => (
                      <li key={s.scope} className="flex items-start gap-3 text-sm">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-good/20 text-good">
                          <Check size={13} />
                        </span>
                        <span>
                          {s.text}
                          <code className="ml-2 font-mono text-[11px] text-muted">{s.scope}</code>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border-t border-line px-6 py-5">
                  <p className="flex items-start gap-2 text-xs text-ink-2">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-good" />
                    You&apos;ll be sent to {info.redirectHost}. You can remove this access at any time from Connected apps.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button className="btn flex-1" disabled={busy} onClick={() => void decide("deny")} id="consent-deny">
                      Cancel
                    </button>
                    <button className="btn btn-primary flex-1" disabled={busy} onClick={() => void decide("allow")} id="consent-allow">
                      Allow
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
