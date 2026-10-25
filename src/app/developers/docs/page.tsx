import type { Metadata } from "next";
import Link from "next/link";
import { Json } from "@/components/kit";
import { SiteHeader } from "@/components/site";
import { ENDPOINTS, EVENTS, SCOPES } from "@/lib/catalog";

export const metadata: Metadata = { title: "API reference", description: "The Convene REST API, OAuth 2.0 and webhooks." };

const BASE = "https://convene-meet.netlify.app";
const COLOR: Record<string, string> = { GET: "#5ee0a0", POST: "#9fb0ff", PATCH: "#f5c97a", DELETE: "#ff8a94" };

const VERIFY = `import crypto from "node:crypto";

// Express: keep the raw body; the signature covers the exact bytes Convene sent.
app.post("/webhooks/convene", express.raw({ type: "application/json" }), (req, res) => {
  const header = req.get("Convene-Signature") ?? "";           // "t=1793632812,v1=5f2b…"
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const expected = crypto.createHmac("sha256", process.env.CONVENE_WEBHOOK_SECRET)
    .update(\`\${t}.\${req.body}\`).digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;  // refuse replays
  if (!fresh || !v1 || !crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected))) {
    return res.sendStatus(401);
  }
  const event = JSON.parse(req.body);
  console.log(event.event, event.payload);
  res.sendStatus(200);                                           // answer within 8 seconds
});`;

const TOC = [
  ["overview", "Overview"],
  ["auth", "Authentication"],
  ["oauth", "OAuth apps"],
  ["server", "Server-to-Server apps"],
  ["scopes", "Scopes"],
  ["errors", "Errors"],
  ["endpoints", "Endpoints"],
  ["webhooks", "Webhooks"],
] as const;

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 border-t border-line pt-10 text-2xl font-semibold tracking-tight first:border-0 first:pt-0">
      {children}
    </h2>
  );
}

const P = ({ children }: { children: React.ReactNode }) => <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">{children}</p>;
const C = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-raise px-1.5 py-0.5 font-mono text-[13px] text-ink">{children}</code>;

export default function Docs() {
  return (
    <div className="w-full">
      <SiteHeader active="docs" />
      <div className="mx-auto flex max-w-6xl gap-10 px-4 pb-24 pt-6 sm:px-6">
        <nav className="sticky top-6 hidden h-max w-52 shrink-0 lg:block" aria-label="On this page">
          <div className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">API reference</div>
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-1.5 text-sm text-ink-2 hover:bg-raise hover:text-ink">
              {label}
            </a>
          ))}
          <div className="mt-3 border-t border-line pt-3">
            {ENDPOINTS.map((e) => (
              <a key={e.id} href={`#${e.id}`} className="flex items-center gap-2 rounded-lg px-3 py-1 text-xs text-ink-2 hover:bg-raise hover:text-ink">
                <span className="w-11 font-mono text-[10px] font-semibold" style={{ color: COLOR[e.method] }}>
                  {e.method}
                </span>
                <span className="truncate">{e.title}</span>
              </a>
            ))}
          </div>
        </nav>

        <main className="min-w-0 flex-1 space-y-10">
          <section>
            <H id="overview">Convene API</H>
            <P>
              A JSON REST API at <C>{BASE}/api/v1</C>. Every request needs an access token in the <C>Authorization: Bearer</C> header, and each endpoint needs one scope. Times are ISO 8601 in UTC;
              meeting IDs are the codes in meeting links, like <C>kfa-wqpz-tnu</C>. Self-hosting? Use your own domain in place of {BASE}.
            </P>
          </section>

          <section className="space-y-4">
            <H id="auth">Authentication</H>
            <P>
              Make an app in the <Link className="text-accent-ink underline" href="/developers/apps">developer portal</Link> to get a client ID and secret. Convene has two kinds of app, and both get short-lived
              bearer tokens (one hour) from <C>POST /oauth/token</C>. Send client credentials with HTTP Basic auth, or as <C>client_id</C> and <C>client_secret</C> in the form body.
            </P>
          </section>

          <section className="space-y-4">
            <H id="oauth">OAuth apps</H>
            <P>For apps other people install. Convene implements the OAuth 2.0 authorization-code grant (RFC 6749) with optional PKCE (RFC 7636).</P>
            <ol className="ml-5 max-w-3xl list-decimal space-y-2 text-[15px] text-ink-2">
              <li>
                Send the user to <C>/oauth/authorize</C> with <C>response_type=code</C>, <C>client_id</C>, a registered <C>redirect_uri</C>, the <C>scope</C>s you need (space separated), a random{" "}
                <C>state</C>, and for PKCE a <C>code_challenge</C> with <C>code_challenge_method=S256</C>.
              </li>
              <li>
                They sign in and see a consent screen listing each scope. On Allow, Convene redirects to your URI with <C>code</C> and <C>state</C>; on Cancel, with <C>error=access_denied</C>.
              </li>
              <li>Exchange the code (single use, 10 minutes) for an access token and a refresh token.</li>
              <li>Refresh before the hour is up. Refresh tokens rotate: each one works once, and the response carries the next.</li>
            </ol>
            <Json value={`curl -X POST ${BASE}/oauth/token \\\n  -u "$CLIENT_ID:$CLIENT_SECRET" \\\n  -d grant_type=authorization_code \\\n  -d code=$CODE \\\n  -d redirect_uri=https://yourapp.example/callback \\\n  -d code_verifier=$VERIFIER`} />
            <Json value={{ access_token: "cvn_at_…", token_type: "bearer", expires_in: 3600, scope: "meeting:read meeting:write", refresh_token: "cvn_rt_…" }} />
            <Json value={`curl -X POST ${BASE}/oauth/token -u "$CLIENT_ID:$CLIENT_SECRET" \\\n  -d grant_type=refresh_token -d refresh_token=$REFRESH_TOKEN`} />
            <P>
              Revoke a token with <C>POST /oauth/revoke</C> and <C>token=…</C>. When a user removes your app under Connected apps, every token issued to it for them stops working and its webhooks stop.
            </P>
          </section>

          <section className="space-y-4">
            <H id="server">Server-to-Server apps</H>
            <P>For your own scripts and back-office systems. The client_credentials grant returns a token that acts for the developer who owns the app, with the app&apos;s scopes, and no refresh token: ask again when it expires.</P>
            <Json value={`curl -X POST ${BASE}/oauth/token \\\n  -u "$CLIENT_ID:$CLIENT_SECRET" \\\n  -d grant_type=client_credentials`} />
          </section>

          <section>
            <H id="scopes">Scopes</H>
            <div className="mt-4 divide-y divide-line rounded-2xl border border-line">
              {Object.entries(SCOPES).map(([s, t]) => (
                <div key={s} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <code className="w-40 shrink-0 font-mono text-[13px] text-accent-ink">{s}</code>
                  <span className="text-sm text-ink-2">{t}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <H id="errors">Errors</H>
            <P>
              Errors come with an HTTP status and a body with a stable <C>code</C> to branch on and a <C>message</C> for people. A missing scope is <C>403 insufficient_scope</C>; an expired or revoked
              token is <C>401 invalid_token</C>.
            </P>
            <Json value={{ error: { code: "insufficient_scope", message: "This token is missing the meeting:write scope." } }} />
          </section>

          <section className="space-y-10">
            <H id="endpoints">Endpoints</H>
            {ENDPOINTS.map((e) => (
              <article key={e.id} id={e.id} className="scroll-mt-24 space-y-3">
                <h3 className="text-lg font-semibold">{e.title}</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-lg border border-line bg-panel px-3 py-1.5 font-mono text-[13px]">
                    <span className="mr-2 font-semibold" style={{ color: COLOR[e.method] }}>
                      {e.method}
                    </span>
                    {e.path}
                  </span>
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 font-mono text-[11px] text-accent-ink">{e.scope}</span>
                </div>
                <p className="max-w-3xl text-[15px] text-ink-2">{e.text}</p>
                <div className="grid gap-3 xl:grid-cols-2">
                  {e.body && (
                    <div>
                      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Request body</div>
                      <Json value={e.body} />
                    </div>
                  )}
                  {e.response !== undefined && (
                    <div className={e.body ? "" : "xl:col-span-2"}>
                      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Response {e.status ?? 200}</div>
                      <Json value={e.response} className="max-h-80" />
                    </div>
                  )}
                </div>
              </article>
            ))}
          </section>

          <section className="space-y-4">
            <H id="webhooks">Webhooks</H>
            <P>
              Set an endpoint URL and choose events on your app&apos;s Webhooks tab. Convene sends events about meetings owned by your account and, for OAuth apps, by everyone who installed your app,
              provided the grant includes the event&apos;s scope. Each delivery is a <C>POST</C> with a JSON body and these headers:
            </P>
            <ul className="ml-5 max-w-3xl list-disc space-y-1.5 text-[15px] text-ink-2">
              <li>
                <C>Convene-Event</C>: the event name. <C>Convene-Delivery</C>: a unique ID; use it to skip duplicates.
              </li>
              <li>
                <C>Convene-Signature</C>: <C>t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</C>, where v1 is HMAC-SHA256 of <C>&lt;t&gt;.&lt;raw body&gt;</C> keyed with the app&apos;s signing secret.
              </li>
            </ul>
            <P>Answer with a 2xx within 8 seconds. Every attempt is in the app&apos;s delivery log for 50 deliveries, with the request and your response, and can be sent again from there.</P>
            <div className="divide-y divide-line rounded-2xl border border-line">
              {Object.entries(EVENTS).map(([ev, v]) => (
                <div key={ev} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <code className="w-44 shrink-0 font-mono text-[13px] text-accent-ink">{ev}</code>
                  <span className="flex-1 text-sm text-ink-2">{v.text}</span>
                  <code className="font-mono text-[11px] text-muted">{v.scope}</code>
                </div>
              ))}
            </div>
            <div className="mb-1.5 mt-6 text-xs font-medium uppercase tracking-wide text-muted">Example: participant.joined</div>
            <Json
              value={{
                event: "participant.joined",
                event_ts: 1793632812000,
                account_id: "4f1c9a7be2d03a18",
                payload: {
                  meeting: { id: "kfa-wqpz-tnu", topic: "Weekly design review", status: "started", join_url: `${BASE}/m/kfa-wqpz-tnu` },
                  participant: { id: "0f9e8d7c6b5a4938", name: "Leo Park", host: false, at: "2026-11-02T15:01:40.000Z" },
                },
              }}
            />
            <div className="mb-1.5 mt-6 text-xs font-medium uppercase tracking-wide text-muted">Verifying a signature (Node.js)</div>
            <Json value={VERIFY} />
          </section>
        </main>
      </div>
    </div>
  );
}
