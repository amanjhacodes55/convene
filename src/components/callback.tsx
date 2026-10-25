"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Field, Json } from "./kit";
import { Logo } from "./ui";

/**
 * Where the default redirect URI lands: a stand-in for a developer's own server, so the whole
 * authorization-code flow can be tried from the portal. It shows the code and exchanges it.
 */
export function Callback() {
  const q = useSearchParams();
  const [test] = useState<{ clientId: string; redirectUri: string; appId: string } | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("convene:oauth-test") ?? "null");
    } catch {
      return null;
    }
  });
  const [secret, setSecret] = useState("");
  const [tokens, setTokens] = useState<Record<string, unknown> | null>(null);
  const [me, setMe] = useState<unknown>(null);
  const [error, setError] = useState("");
  const code = q.get("code");
  const err = q.get("error");

  async function exchange() {
    setError("");
    const res = await fetch("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: code!, redirect_uri: test?.redirectUri ?? location.origin + location.pathname, client_id: test?.clientId ?? "", client_secret: secret }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error_description ?? json.error);
    setTokens(json);
  }

  async function callMe() {
    const res = await fetch("/api/v1/users/me", { headers: { Authorization: `Bearer ${tokens!.access_token}` } });
    setMe(await res.json());
  }

  const curl = `curl -X POST ${location.origin}/oauth/token \\\n  -u "${test?.clientId ?? "$CLIENT_ID"}:$CLIENT_SECRET" \\\n  -d grant_type=authorization_code \\\n  -d code=${code} \\\n  -d redirect_uri=${test?.redirectUri ?? location.origin + location.pathname}`;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href="/developers/apps" className="mb-8 flex items-center gap-2.5 font-semibold">
        <Logo /> Convene for developers
      </Link>
      <div className="card p-6">
        {err ? (
          <>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <XCircle className="text-danger" /> Authorization didn&apos;t complete
            </h1>
            <p className="mt-2 text-sm text-ink-2">
              Convene redirected back with <code className="font-mono">error={err}</code>
              {err === "access_denied" && ": the user pressed Cancel."}
            </p>
          </>
        ) : (
          <>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <CheckCircle2 className="text-good" /> Authorization code received
            </h1>
            <p className="mt-2 text-sm text-ink-2">
              This page stands in for your app&apos;s redirect URI. Your server exchanges the code for tokens within 10 minutes; it works once.
            </p>
            <div className="mt-4 space-y-2">
              <Json value={{ code, state: q.get("state") }} />
              <Json value={curl} />
            </div>
            {!tokens ? (
              <form
                className="mt-5 space-y-3 border-t border-line pt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void exchange();
                }}
              >
                <Field label="Exchange it here" hint="Paste the app's client secret. It goes only to this site's token endpoint.">
                  <input className="input font-mono text-[13px]" type="password" placeholder="cvn_cs_…" value={secret} onChange={(e) => setSecret(e.target.value)} id="cb-secret" />
                </Field>
                {error && <p className="text-sm text-danger">{error}</p>}
                <button className="btn btn-primary" disabled={!secret || !test} id="cb-exchange">
                  Exchange code for tokens
                </button>
                {!test && <p className="text-xs text-muted">Start from an app&apos;s “Test the install flow” button to exchange here.</p>}
              </form>
            ) : (
              <div className="mt-5 space-y-3 border-t border-line pt-5">
                <div className="text-sm font-medium">Tokens</div>
                <Json value={tokens} />
                <button className="btn btn-primary" onClick={() => void callMe()} id="cb-me">
                  Call GET /api/v1/users/me
                </button>
                {me !== null && <Json value={me} />}
              </div>
            )}
          </>
        )}
      </div>
      {test && (
        <Link href={`/developers/apps/${test.appId}`} className="mt-5 inline-block text-sm text-ink-2 hover:text-ink">
          ← Back to the app
        </Link>
      )}
    </main>
  );
}
