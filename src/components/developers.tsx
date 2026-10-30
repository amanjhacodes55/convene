"use client";

import { AppWindow, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Inbox, KeyRound, Play, Plus, RefreshCw, Send, ServerCog, ShieldCheck, Trash2, Webhook, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { call, useResource } from "@/client/fetch";
import { ENDPOINTS, EVENTS, SCOPES, type Endpoint, type Scope } from "@/lib/catalog";
import { Badge, CopyField, Empty, Field, Json, Modal, Tabs, ago } from "./kit";
import type { ApiMeeting } from "./meetings";
import { PageTitle, PortalShell } from "./portal";

export type DevApp = {
  id: string;
  name: string;
  description: string;
  type: "oauth" | "server";
  clientId: string;
  secretHint: string;
  redirectUris: string[];
  scopes: Scope[];
  webhook: { url: string; secret: string; events: string[]; enabled: boolean } | null;
  createdAt: number;
  updatedAt: number;
};

type Delivery = { id: string; event: string; url: string; at: number; ms: number; status: number; ok: boolean; error: string | null; body: string; response: string };
type BinRequest = { id: string; at: number; method: string; headers: Record<string, string>; body: string; verified: boolean | null };

const TYPE_LABEL = { oauth: "OAuth", server: "Server-to-Server" } as const;
const binId = (url: string) => url.match(/\/api\/bins\/([0-9a-f]{20})$/)?.[1] ?? null;

export const METHOD_COLOR: Record<string, string> = { GET: "var(--good)", POST: "var(--code-key)", PATCH: "var(--code-num)", DELETE: "var(--code-del)" };
export function Method({ m }: { m: string }) {
  return (
    <span className="inline-block w-14 shrink-0 font-mono text-[11px] font-semibold" style={{ color: METHOD_COLOR[m] }}>
      {m}
    </span>
  );
}

// ---- the list --------------------------------------------------------------------------------

export function AppsPage() {
  return (
    <PortalShell>
      <AppsList />
    </PortalShell>
  );
}

function AppsList() {
  const { data } = useResource<{ apps: DevApp[] }>("/api/apps");
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageTitle title="Your apps" sub="Build integrations with the Convene REST API, OAuth 2.0 and webhooks.">
        <Link className="btn" href="/developers/docs">
          API reference
        </Link>
        <button className="btn btn-primary" onClick={() => setCreating(true)} id="create-app">
          <Plus size={17} /> Create app
        </button>
      </PageTitle>
      {data && !data.apps.length && (
        <Empty icon={<AppWindow size={22} />} title="Create your first app">
          An OAuth app acts for anyone who installs it. A server-to-server app acts for your own account, for scripts and back-office sync.
        </Empty>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.apps.map((a) => (
          <Link key={a.id} href={`/developers/apps/${a.id}`} className="card group flex gap-4 p-5 transition-colors hover:border-accent/50">
            <AppIcon app={a} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{a.name}</span>
                <Badge tone={a.type === "oauth" ? "accent" : "neutral"}>{TYPE_LABEL[a.type]}</Badge>
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{a.description || "No description"}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>{a.scopes.length} scopes</span>
                <span className="flex items-center gap-1">
                  <Webhook size={12} /> {a.webhook?.enabled && a.webhook.url ? `${a.webhook.events.length} events` : "No webhooks"}
                </span>
                <span>Created {ago(a.createdAt)}</span>
              </div>
            </div>
            <ChevronRight size={18} className="self-center text-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
      {creating && <CreateApp onClose={() => setCreating(false)} />}
    </>
  );
}

function AppIcon({ app, size = 44 }: { app: Pick<DevApp, "name" | "type">; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl font-semibold text-white"
      style={{ width: size, height: size, background: app.type === "oauth" ? "linear-gradient(135deg,#6d7cff,#8f6dff)" : "linear-gradient(135deg,#2fb5a5,#3e8fcf)", fontSize: size * 0.4 }}
    >
      {app.name[0]?.toUpperCase()}
    </span>
  );
}

function CreateApp({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [type, setType] = useState<"oauth" | "server" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [redirects, setRedirects] = useState(() => `${location.origin}/developers/callback`);
  const [scopes, setScopes] = useState<Scope[]>(["user:read", "meeting:read"]);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ app: DevApp; clientSecret: string } | null>(null);

  async function create() {
    setError("");
    try {
      setCreated(await call("/api/apps", "POST", { name, description, type, redirectUris: type === "oauth" ? redirects.split(/\s+/) : [], scopes }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (created) {
    return (
      <Modal title="Your app is ready" onClose={() => router.push(`/developers/apps/${created.app.id}`)}>
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-ink">
            <KeyRound size={16} className="mt-0.5 shrink-0 text-warn" />
            Copy the client secret now. It&apos;s stored hashed and won&apos;t be shown again; you can always generate a new one.
          </p>
          <CopyField label="Client ID" value={created.app.clientId} id="new-client-id" />
          <CopyField label="Client secret" value={created.clientSecret} id="new-client-secret" />
          <button className="btn btn-primary w-full" onClick={() => router.push(`/developers/apps/${created.app.id}`)} id="go-to-app">
            Continue to app <ArrowRight size={16} />
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={type ? `New ${TYPE_LABEL[type]} app` : "Choose an app type"} onClose={onClose} wide={!type}>
      {!type ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["oauth", AppWindow, "OAuth", "For apps other people install. Users sign in to Convene and allow access; your app gets tokens that act for them."],
              ["server", ServerCog, "Server-to-Server", "For your own scripts and back-office systems. Exchange your credentials for a token that acts for your account."],
            ] as const
          ).map(([t, Icon, title, text]) => (
            <button key={t} className="card p-5 text-left transition-colors hover:border-accent" onClick={() => setType(t)} id={`type-${t}`}>
              <Icon size={22} className="text-accent-ink" />
              <div className="mt-3 font-semibold">{title}</div>
              <p className="mt-1 text-sm text-ink-2">{text}</p>
            </button>
          ))}
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Field label="App name">
            <input className="input" id="app-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus required />
          </Field>
          <Field label="Description" hint="Shown to people when they authorize your app.">
            <input className="input" id="app-description" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {type === "oauth" && (
            <Field label="Redirect URIs" hint="One per line. https only, except http://localhost. The default points at a built-in page for testing the flow.">
              <textarea className="input h-20 resize-none py-2 font-mono text-xs" value={redirects} onChange={(e) => setRedirects(e.target.value)} />
            </Field>
          )}
          <ScopePicker value={scopes} onChange={setScopes} />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={() => setType(null)}>
              Back
            </button>
            <button className="btn btn-primary flex-1" id="app-create">
              Create app
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ScopePicker({ value, onChange }: { value: Scope[]; onChange: (s: Scope[]) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Scopes</legend>
      <div className="mt-2 divide-y divide-line rounded-xl border border-line">
        {(Object.keys(SCOPES) as Scope[]).map((s) => (
          <label key={s} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-raise/50">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
              checked={value.includes(s)}
              onChange={(e) => onChange(e.target.checked ? [...value, s] : value.filter((x) => x !== s))}
              data-scope={s}
            />
            <span>
              <code className="font-mono text-[13px] text-accent-ink">{s}</code>
              <span className="block text-xs text-ink-2">{SCOPES[s]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---- one app ---------------------------------------------------------------------------------

type Tab = "credentials" | "scopes" | "webhooks" | "playground";

export function AppPage({ id }: { id: string }) {
  return (
    <PortalShell>
      <AppDetail id={id} />
    </PortalShell>
  );
}

function AppDetail({ id }: { id: string }) {
  const { data, error, setData } = useResource<{ app: DevApp }>(`/api/apps/${id}`);
  const [tab, setTab] = useState<Tab>(() => {
    const h = typeof location !== "undefined" ? location.hash.slice(1) : "";
    return (["credentials", "scopes", "webhooks", "playground"] as const).find((t) => t === h) ?? "credentials";
  });
  const choose = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  };
  if (error) return <Empty icon={<AppWindow size={22} />} title="App not found">{error}</Empty>;
  if (!data) return <p className="text-ink-2">Loading…</p>;
  const app = data.app;
  const setApp = (a: DevApp) => setData({ app: a });

  return (
    <>
      <Link href="/developers/apps" className="text-sm text-ink-2 hover:text-ink">
        ← Your apps
      </Link>
      <div className="mb-5 mt-3 flex items-center gap-4">
        <AppIcon app={app} size={52} />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="truncate">{app.name}</span>
            <Badge tone={app.type === "oauth" ? "accent" : "neutral"}>{TYPE_LABEL[app.type]}</Badge>
          </h1>
          <p className="text-sm text-ink-2">{app.description || "No description"}</p>
        </div>
      </div>
      <Tabs
        tabs={[
          { id: "credentials", label: "Credentials" },
          { id: "scopes", label: `Scopes (${app.scopes.length})` },
          { id: "webhooks", label: "Webhooks" },
          { id: "playground", label: "Try the API" },
        ]}
        value={tab}
        onChange={choose}
      />
      <div className="mt-6">
        {tab === "credentials" && <Credentials app={app} setApp={setApp} />}
        {tab === "scopes" && <Scopes app={app} setApp={setApp} />}
        {tab === "webhooks" && <Webhooks app={app} setApp={setApp} />}
        {tab === "playground" && <Playground app={app} goScopes={() => choose("scopes")} />}
      </div>
    </>
  );
}

function Section({ title, sub, children, aside }: { title: string; sub?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {sub && <p className="mt-0.5 text-sm text-ink-2">{sub}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Credentials({ app, setApp }: { app: DevApp; setApp: (a: DevApp) => void }) {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [redirects, setRedirects] = useState(app.redirectUris.join("\n"));
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"rotate" | "delete" | null>(null);
  const origin = typeof location !== "undefined" ? location.origin : "";
  const redirect = app.redirectUris[0] ?? "";
  const installUrl = `${origin}/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: app.clientId, redirect_uri: redirect, scope: app.scopes.join(" "), state: "test" })}`;

  return (
    <div className="space-y-5">
      <Section title="App credentials" sub={app.type === "oauth" ? "Your server uses these to exchange authorization codes for tokens." : "Exchange these for an access token with the client_credentials grant."}>
        <div className="grid gap-4 md:grid-cols-2">
          <CopyField label="Client ID" value={app.clientId} id="client-id" />
          {secret ? (
            <CopyField label="Client secret (new)" value={secret} id="client-secret" />
          ) : (
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Client secret</div>
              <div className="flex h-[42px] items-center rounded-xl border border-line bg-bg px-3 font-mono text-[13px] text-ink-2">{app.secretHint}</div>
            </div>
          )}
        </div>
        <button className="btn mt-4 h-9 text-sm" onClick={() => setConfirm("rotate")}>
          <RefreshCw size={15} /> Regenerate secret
        </button>
        {app.type === "server" && (
          <div className="mt-5">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Get a token</div>
            <Json value={`curl -X POST ${origin}/oauth/token \\\n  -u "${app.clientId}:$CLIENT_SECRET" \\\n  -d grant_type=client_credentials`} />
          </div>
        )}
      </Section>

      {app.type === "oauth" && (
        <Section title="OAuth" sub="Send people to the install URL. After they allow access, Convene redirects back to your app with a code.">
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                setApp((await call<{ app: DevApp }>(`/api/apps/${app.id}`, "PATCH", { redirectUris: redirects.split(/\s+/) })).app);
                setSaved("redirects");
                setTimeout(() => setSaved(""), 1500);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <Field label="Redirect URIs" hint="One per line. The redirect_uri in each request must match one exactly.">
              <textarea className="input h-20 resize-none py-2 font-mono text-xs" value={redirects} onChange={(e) => setRedirects(e.target.value)} />
            </Field>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button className="btn h-9 text-sm">{saved === "redirects" ? "Saved" : "Save redirect URIs"}</button>
          </form>
          {redirect && (
            <div className="mt-5 space-y-3 border-t border-line pt-5">
              <CopyField label="Install URL" value={installUrl} />
              <button
                className="btn btn-primary h-9 text-sm"
                id="test-install"
                onClick={() => {
                  try {
                    sessionStorage.setItem("convene:oauth-test", JSON.stringify({ clientId: app.clientId, redirectUri: redirect, appId: app.id }));
                  } catch {}
                  router.push(installUrl);
                }}
              >
                <Play size={15} /> Test the install flow
              </button>
            </div>
          )}
        </Section>
      )}

      <Section title="Delete app" sub="Revokes every token, removes it from every account that installed it, and stops its webhooks.">
        <button className="btn h-9 text-sm text-danger" onClick={() => setConfirm("delete")}>
          <Trash2 size={15} /> Delete {app.name}
        </button>
      </Section>

      {confirm && (
        <Modal title={confirm === "rotate" ? "Regenerate the client secret?" : `Delete ${app.name}?`} onClose={() => setConfirm(null)}>
          <p className="text-sm text-ink-2">
            {confirm === "rotate" ? "The current secret stops working at once. Tokens already issued keep working until they expire." : "This can't be undone."}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (confirm === "rotate") {
                  const r = await call<{ app: DevApp; clientSecret: string }>(`/api/apps/${app.id}/rotate-secret`, "POST");
                  setApp(r.app);
                  setSecret(r.clientSecret);
                  setConfirm(null);
                } else {
                  await call(`/api/apps/${app.id}`, "DELETE");
                  router.push("/developers/apps");
                }
              }}
            >
              {confirm === "rotate" ? "Regenerate" : "Delete app"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Scopes({ app, setApp }: { app: DevApp; setApp: (a: DevApp) => void }) {
  const [scopes, setScopes] = useState<Scope[]>(app.scopes);
  const [saved, setSaved] = useState(false);
  const dirty = scopes.slice().sort().join() !== app.scopes.slice().sort().join();
  return (
    <Section
      title="Scopes"
      sub={app.type === "oauth" ? "What your app may ask for. People see each one on the consent screen; existing tokens keep the scopes they were granted." : "What tokens for this app can do."}
    >
      <ScopePicker value={scopes} onChange={setScopes} />
      <button
        className="btn btn-primary mt-4"
        disabled={!dirty && !saved}
        id="save-scopes"
        onClick={async () => {
          setApp((await call<{ app: DevApp }>(`/api/apps/${app.id}`, "PATCH", { scopes })).app);
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        }}
      >
        {saved ? "Saved" : "Save scopes"}
      </button>
    </Section>
  );
}

// ---- webhooks --------------------------------------------------------------------------------

function Webhooks({ app, setApp }: { app: DevApp; setApp: (a: DevApp) => void }) {
  const hook = app.webhook;
  const [url, setUrl] = useState(hook?.url ?? "");
  const [events, setEvents] = useState<string[]>(hook?.events ?? ["meeting.started", "meeting.ended", "participant.joined", "participant.left"]);
  const [enabled, setEnabled] = useState(hook?.enabled ?? true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const { data: log, reload } = useResource<{ deliveries: Delivery[] }>(hook?.url ? `/api/apps/${app.id}/deliveries` : null);

  useEffect(() => {
    if (!hook?.url) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [hook?.url, reload]);

  const save = async (patch?: Partial<NonNullable<DevApp["webhook"]>>) => {
    setError("");
    try {
      setApp((await call<{ app: DevApp }>(`/api/apps/${app.id}`, "PATCH", { webhook: { url, events, enabled, ...patch } })).app);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const missing = (scope: Scope) => !app.scopes.includes(scope);
  const bin = hook?.url ? binId(hook.url) : null;

  return (
    <div className="space-y-5">
      <Section
        title="Event subscriptions"
        sub="Convene POSTs a signed JSON event to your endpoint when something happens in a meeting owned by your account, or by anyone who installed your app."
        aside={
          <label className="flex items-center gap-2 text-sm">
            Enabled
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(!enabled)}
              className="relative h-6 w-11 rounded-full transition-colors"
              style={{ background: enabled ? "var(--accent)" : "var(--raise)" }}
            >
              <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: enabled ? 22 : 2 }} />
            </button>
          </label>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Endpoint URL">
            <div className="flex flex-wrap gap-2">
              <input className="input min-w-0 flex-1 font-mono text-[13px]" id="hook-url" placeholder="https://example.com/webhooks/convene" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button
                type="button"
                className="btn h-11"
                id="use-inbox"
                onClick={async () => {
                  const { id } = await call<{ id: string }>("/api/bins", "POST");
                  setUrl(`${location.origin}/api/bins/${id}`);
                }}
              >
                <Inbox size={16} /> Use a test inbox
              </button>
            </div>
          </Field>
          <fieldset>
            <legend className="text-sm font-medium">Events</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(Object.keys(EVENTS) as (keyof typeof EVENTS)[]).map((e) => (
                <label key={e} className={`flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-raise/50 ${missing(EVENTS[e].scope) ? "opacity-60" : ""}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                    checked={events.includes(e)}
                    onChange={(ev) => setEvents(ev.target.checked ? [...events, e] : events.filter((x) => x !== e))}
                    data-event={e}
                  />
                  <span className="min-w-0">
                    <code className="font-mono text-[13px] text-accent-ink">{e}</code>
                    <span className="block text-xs text-ink-2">{EVENTS[e].text}</span>
                    {missing(EVENTS[e].scope) && <span className="block text-xs text-warn">Needs the {EVENTS[e].scope} scope</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" id="save-hook">
              {saved ? "Saved" : "Save"}
            </button>
            {hook?.url && (
              <button
                type="button"
                className="btn"
                id="send-test"
                disabled={testing}
                onClick={async () => {
                  setTesting(true);
                  await call(`/api/apps/${app.id}/test-webhook`, "POST").catch(() => {});
                  setTesting(false);
                  reload();
                }}
              >
                <Send size={15} /> {testing ? "Sending…" : "Send test event"}
              </button>
            )}
          </div>
        </form>
      </Section>

      {hook && (
        <Section title="Secret token" sub="Every delivery carries a Convene-Signature header: an HMAC-SHA256 of the timestamp and body with this secret. Check it before trusting a request.">
          <CopyField value={hook.secret} secret label="Signing secret" />
          <button
            className="btn mt-3 h-9 text-sm"
            onClick={async () => {
              setApp((await call<{ app: DevApp }>(`/api/apps/${app.id}/rotate-webhook-secret`, "POST")).app);
            }}
          >
            <RefreshCw size={15} /> Rotate
          </button>
        </Section>
      )}

      {bin && <TestInbox id={bin} />}

      {hook?.url && (
        <Section title="Recent deliveries" sub="The last 50 attempts. Open one to see what was sent and what your endpoint answered.">
          {!log?.deliveries.length ? <p className="text-sm text-muted">Nothing sent yet. Start one of your meetings, or send a test event.</p> : <Deliveries app={app} list={log.deliveries} onRedeliver={reload} />}
        </Section>
      )}
    </div>
  );
}

function Deliveries({ app, list, onRedeliver }: { app: DevApp; list: Delivery[]; onRedeliver: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line" id="deliveries">
      {list.map((d) => (
        <div key={d.id}>
          <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-raise/50" onClick={() => setOpen(open === d.id ? null : d.id)}>
            {d.ok ? <CheckCircle2 size={16} className="shrink-0 text-good" /> : <XCircle size={16} className="shrink-0 text-danger" />}
            <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{d.event}</code>
            <span className={`font-mono text-xs ${d.ok ? "text-good" : "text-danger"}`}>{d.status || "ERR"}</span>
            <span className="hidden w-16 text-right text-xs text-muted sm:block">{d.ms} ms</span>
            <span className="w-20 text-right text-xs text-muted">{ago(d.at)}</span>
            <ChevronDown size={15} className={`text-muted transition-transform ${open === d.id ? "rotate-180" : ""}`} />
          </button>
          {open === d.id && (
            <div className="space-y-3 bg-bg/50 p-3">
              {d.error && <p className="text-sm text-danger">{d.error}</p>}
              <div className="text-xs text-muted">
                POST <span className="font-mono">{d.url}</span>
              </div>
              <Json value={JSON.parse(d.body)} className="max-h-72" />
              {d.response && (
                <>
                  <div className="text-xs text-muted">Response</div>
                  <Json value={d.response} className="max-h-40" />
                </>
              )}
              <button
                className="btn h-8 text-xs"
                onClick={async () => {
                  await call(`/api/apps/${app.id}/redeliver`, "POST", { delivery: d.id });
                  onRedeliver();
                }}
              >
                <RefreshCw size={13} /> Redeliver
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TestInbox({ id }: { id: string }) {
  const { data, reload } = useResource<{ requests: BinRequest[] }>(`/api/bins/${id}`);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(reload, 2500);
    return () => clearInterval(t);
  }, [reload]);
  const list = data?.requests ?? [];
  const shown = open ?? list[0]?.id;
  const current = list.find((r) => r.id === shown);
  return (
    <Section
      title="Test inbox"
      sub="Requests your endpoint received, as your server would see them. Signatures are checked against your app's secret."
      aside={
        <span className="flex items-center gap-1.5 text-xs text-good">
          <span className="rec-dot h-2 w-2 rounded-full bg-good" /> Listening
        </span>
      }
    >
      {!list.length ? (
        <p className="text-sm text-muted">Waiting for the first request…</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[260px_1fr]" id="inbox">
          <div className="scroll-thin max-h-96 space-y-1 overflow-y-auto">
            {list.map((r) => {
              const body = safeJson(r.body);
              return (
                <button key={r.id} onClick={() => setOpen(r.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${shown === r.id ? "bg-accent/15" : "hover:bg-raise"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <code className="truncate font-mono text-[12.5px]">{(body as { event?: string })?.event ?? r.method}</code>
                    {r.verified ? <ShieldCheck size={14} className="shrink-0 text-good" /> : r.verified === false ? <XCircle size={14} className="shrink-0 text-danger" /> : null}
                  </div>
                  <div className="text-xs text-muted">{new Date(r.at).toLocaleTimeString()}</div>
                </button>
              );
            })}
          </div>
          {current && (
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {current.verified ? (
                  <Badge tone="good">
                    <ShieldCheck size={12} /> Signature verified
                  </Badge>
                ) : current.verified === false ? (
                  <Badge tone="danger">Signature doesn&apos;t match</Badge>
                ) : (
                  <Badge>Unsigned</Badge>
                )}
                {Object.entries(current.headers)
                  .filter(([k]) => k.startsWith("convene-") && k !== "convene-signature")
                  .map(([k, v]) => (
                    <span key={k} className="font-mono text-muted">
                      {k}: {v}
                    </span>
                  ))}
              </div>
              <Json value={safeJson(current.body) ?? current.body} className="max-h-[22rem]" />
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

const safeJson = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

// ---- the playground --------------------------------------------------------------------------

function Playground({ app, goScopes }: { app: DevApp; goScopes: () => void }) {
  const [endpointId, setEndpointId] = useState(ENDPOINTS[1].id);
  const ep = ENDPOINTS.find((e) => e.id === endpointId)!;
  const { data: mine } = useResource<{ meetings: ApiMeeting[] }>("/api/meetings");
  const [meetingId, setMeetingId] = useState("");
  const [registrantId, setRegistrantId] = useState("");
  const [query, setQuery] = useState(ENDPOINTS[1].query ?? "");
  const [body, setBody] = useState("");
  const [tok, setTok] = useState<{ token: string; exp: number } | null>(null);
  const [result, setResult] = useState<{ status: number; ms: number; json: unknown } | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (e: Endpoint) => {
    setEndpointId(e.id);
    setBody(e.body ? JSON.stringify(e.body, null, 2) : "");
    setQuery(e.query ?? "");
    setResult(null);
  };

  const meetings = mine?.meetings ?? [];
  const chosenMeeting = meetingId || meetings.find((m) => m.status === "started")?.id || meetings[0]?.id || "";
  const path = ep.path.replace("{meetingId}", chosenMeeting || "{meetingId}").replace("{registrantId}", registrantId || "{registrantId}") + (query && ep.method === "GET" ? `?${query}` : "");
  const allowed = app.scopes.includes(ep.scope);
  const payload = body || (ep.body ? JSON.stringify(ep.body, null, 2) : "");
  const origin = typeof location !== "undefined" ? location.origin : "";

  async function send() {
    setBusy(true);
    try {
      let t = tok;
      if (!t || t.exp < Date.now() + 60_000) {
        const r = await call<{ access_token: string; expires_in: number }>(`/api/apps/${app.id}/test-token`, "POST");
        t = { token: r.access_token, exp: Date.now() + r.expires_in * 1000 };
        setTok(t);
      }
      const started = performance.now();
      const res = await fetch(path, {
        method: ep.method,
        headers: { Authorization: `Bearer ${t.token}`, ...(ep.body ? { "Content-Type": "application/json" } : {}) },
        body: ep.body ? payload : undefined,
      });
      const text = await res.text();
      setResult({ status: res.status, ms: Math.round(performance.now() - started), json: text ? (safeJson(text) ?? text) : null });
    } finally {
      setBusy(false);
    }
  }

  const curl = [`curl -X ${ep.method} "${origin}${path}"`, `  -H "Authorization: Bearer $ACCESS_TOKEN"`, ...(ep.body ? [`  -H "Content-Type: application/json"`, `  -d '${(safeJson(payload) ? JSON.stringify(safeJson(payload)) : payload).replace(/'/g, "'\\''")}'`] : [])].join(" \\\n");

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <nav className="card h-max p-2" aria-label="Endpoints">
        {ENDPOINTS.map((e) => (
          <button key={e.id} onClick={() => pick(e)} className={`flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm ${e.id === ep.id ? "bg-accent/15 text-ink" : "text-ink-2 hover:bg-raise"}`} data-endpoint={e.id}>
            <Method m={e.method} />
            <span className="truncate">{e.title}</span>
          </button>
        ))}
      </nav>
      <div className="min-w-0 space-y-4">
        <Section title={ep.title} sub={ep.text} aside={<Badge tone={allowed ? "accent" : "warn"}>{ep.scope}</Badge>}>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-[13px]">
            <Method m={ep.method} />
            <span className="min-w-0 truncate">{path}</span>
          </div>
          <div className="mt-4 space-y-3">
            {ep.path.includes("{meetingId}") && (
              <Field label="Meeting">
                <select className="input" value={chosenMeeting} onChange={(e) => setMeetingId(e.target.value)} id="pg-meeting">
                  {!meetings.length && <option value="">No meetings yet: create one first</option>}
                  {meetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.topic} · {m.id} · {m.status}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {ep.path.includes("{registrantId}") && (
              <Field label="Registrant ID" hint="From List registrants">
                <input className="input font-mono text-[13px]" value={registrantId} onChange={(e) => setRegistrantId(e.target.value.trim())} />
              </Field>
            )}
            {ep.method === "GET" && ep.query !== undefined && (
              <Field label="Query">
                <input className="input font-mono text-[13px]" value={query} onChange={(e) => setQuery(e.target.value)} />
              </Field>
            )}
            {ep.body && (
              <Field label="Request body">
                <textarea className="input h-44 resize-y py-2.5 font-mono text-[12.5px] leading-relaxed" spellCheck={false} value={payload} onChange={(e) => setBody(e.target.value)} id="pg-body" />
              </Field>
            )}
          </div>
          {!allowed && (
            <p className="mt-3 text-sm text-warn">
              This app doesn&apos;t have the {ep.scope} scope, so the API will answer 403.{" "}
              <button className="underline" onClick={goScopes}>
                Add it
              </button>
            </p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <button
              className="btn btn-primary"
              disabled={busy}
              id="pg-send"
              onClick={() => void send()}
            >
              <Send size={15} /> {busy ? "Sending…" : "Send request"}
            </button>
            <span className="text-xs text-muted">Uses a 1-hour token for your account with this app&apos;s scopes.</span>
          </div>
        </Section>
        {result && (
          <Section
            title="Response"
            aside={
              <span className="flex items-center gap-3 font-mono text-xs">
                <span className={result.status < 300 ? "text-good" : "text-danger"} id="pg-status">
                  {result.status}
                </span>
                <span className="text-muted">{result.ms} ms</span>
              </span>
            }
          >
            {result.json === null ? <p className="text-sm text-muted">No content.</p> : <Json value={result.json} className="max-h-[28rem]" />}
          </Section>
        )}
        <Section title="cURL">
          <Json value={curl} />
        </Section>
      </div>
    </div>
  );
}
