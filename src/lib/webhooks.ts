import { createHmac, randomBytes } from "node:crypto";
import { after } from "next/server";
import { RoomError } from "./errors";
import { EVENTS, type EventName } from "./catalog";
import { appsListening, listApps, ownApp, type App } from "./oauth";
import { kv } from "./store";

// Webhooks: when something happens in a meeting that belongs to an account, every app listening for
// that account (its own apps, and apps it has authorized with the right scope) gets a signed POST.
//
//   Convene-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with the app's secret>
//
// Deliveries are recorded per app (newest 50) so the portal can show them and send them again.
//
// Keys:
//   apps/<id>/deliveries/<inverted time>   one delivery attempt
//   bins/<id>                              a test inbox: { ownerId }
//   bins/<id>/req/<inverted time>          one request it received

export { EVENTS, type EventName };

export type Delivery = {
  id: string;
  event: string;
  url: string;
  at: number;
  ms: number;
  status: number;
  ok: boolean;
  error: string | null;
  body: string;
  response: string;
};

const MAX_DELIVERIES = 50;
const MAX_BIN = 50;
const inverted = (now: number) => (1e15 - now).toString().padStart(16, "0") + randomBytes(2).toString("hex");

/** Runs work after the response is sent when there is a request to hang it on, right away otherwise. */
export function later(task: () => Promise<unknown>) {
  const run = () => task().catch((e) => console.error("convene: background task failed", e));
  try {
    after(run);
  } catch {
    void run();
  }
}

export function sign(secret: string, body: string, t: number) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

/** Checks a Convene-Signature header against a body: what a receiver does, used by the test inbox. */
export function verify(secret: string, body: string, header: string | null, now = Date.now(), toleranceSec = 300) {
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(now / 1000 - t) > toleranceSec) return false;
  return sign(secret, body, t) === `t=${t},v1=${parts.v1}`;
}

/** Fans an event out to every app listening for this account. */
export function emit(ownerId: string | null | undefined, event: EventName, payload: Record<string, unknown>, now = Date.now()) {
  if (!ownerId) return;
  later(async () => {
    const need = EVENTS[event].scope;
    const targets = (await appsListening(ownerId)).filter(({ app, scopes }) => app.webhook?.enabled && app.webhook.url && app.webhook.events.includes(event) && scopes.includes(need));
    const body = JSON.stringify({ event, event_ts: now, account_id: ownerId, payload });
    await Promise.all(targets.map(({ app }) => deliver(app, event, body)));
  });
}

async function deliver(app: App, event: string, body: string, now = Date.now()): Promise<Delivery> {
  const hook = app.webhook!;
  const id = randomBytes(8).toString("hex");
  const started = performance.now();
  let status = 0;
  let response = "";
  let error: string | null = null;
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Convene-Webhooks/1.0",
        "Convene-Event": event,
        "Convene-Delivery": id,
        "Convene-Signature": sign(hook.secret, body, Math.floor(now / 1000)),
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    status = res.status;
    response = (await res.text()).slice(0, 1000);
  } catch (e) {
    error = (e as Error).name === "TimeoutError" ? "Timed out after 8 seconds" : (e as Error).message || "Request failed";
  }
  const d: Delivery = { id, event, url: hook.url, at: now, ms: Math.round(performance.now() - started), status, ok: status >= 200 && status < 300, error, body, response };
  const store = kv();
  await store.set(`apps/${app.id}/deliveries/${inverted(now)}`, d);
  const keys = await store.list(`apps/${app.id}/deliveries/`);
  await Promise.all(keys.slice(MAX_DELIVERIES).map((k) => store.delete(k)));
  return d;
}

export async function listDeliveries(ownerId: string, appId: string) {
  await ownApp(ownerId, appId);
  const store = kv();
  const keys = await store.list(`apps/${appId}/deliveries/`);
  return (await Promise.all(keys.map((k) => store.get<Delivery>(k)))).filter((d): d is Delivery => d !== null);
}

/** Sends a sample event now and returns how it went. */
export async function sendTest(ownerId: string, appId: string, origin: string) {
  const app = await ownApp(ownerId, appId);
  if (!app.webhook?.url) throw new RoomError(400, "Add an endpoint URL first.");
  const now = Date.now();
  const body = JSON.stringify({
    event: "endpoint.test",
    event_ts: now,
    account_id: ownerId,
    payload: { message: "This is a test event from Convene. If you can read this, your endpoint works.", app: { id: app.id, name: app.name }, docs: `${origin}/developers/docs#webhooks` },
  });
  return deliver(app, "endpoint.test", body, now);
}

export async function redeliver(ownerId: string, appId: string, deliveryId: string) {
  const app = await ownApp(ownerId, appId);
  if (!app.webhook?.url) throw new RoomError(400, "Add an endpoint URL first.");
  const old = (await listDeliveries(ownerId, appId)).find((d) => d.id === deliveryId);
  if (!old) throw new RoomError(404, "That delivery is no longer in the log.");
  return deliver(app, old.event, old.body);
}

// ---- test inboxes ---------------------------------------------------------------------------
// A built-in receiver, like webhook.site, so developers can watch deliveries without a server.

export type BinRequest = { id: string; at: number; method: string; headers: Record<string, string>; body: string; verified?: boolean | null };

export async function createBin(ownerId: string) {
  const id = randomBytes(10).toString("hex");
  await kv().set(`bins/${id}`, { ownerId });
  return { id };
}

export async function receive(binId: string, req: Request, now = Date.now()) {
  const bin = /^[0-9a-f]{20}$/.test(binId) ? await kv().get<{ ownerId: string }>(`bins/${binId}`) : null;
  if (!bin) throw new RoomError(404, "No such inbox.");
  const keep = ["content-type", "user-agent", "convene-event", "convene-delivery", "convene-signature"];
  const headers = Object.fromEntries([...req.headers].filter(([k]) => keep.includes(k)));
  const body = (await req.text()).slice(0, 20_000);
  const store = kv();
  await store.set(`bins/${binId}/req/${inverted(now)}`, { id: randomBytes(6).toString("hex"), at: now, method: req.method, headers, body } satisfies BinRequest);
  const keys = await store.list(`bins/${binId}/req/`);
  await Promise.all(keys.slice(MAX_BIN).map((k) => store.delete(k)));
}

export async function readBin(ownerId: string, binId: string) {
  const bin = /^[0-9a-f]{20}$/.test(binId) ? await kv().get<{ ownerId: string }>(`bins/${binId}`) : null;
  if (!bin || bin.ownerId !== ownerId) throw new RoomError(404, "No such inbox.");
  const store = kv();
  const keys = await store.list(`bins/${binId}/req/`);
  const reqs = (await Promise.all(keys.map((k) => store.get<BinRequest>(k)))).filter((r): r is BinRequest => r !== null);
  // Check each signature against the developer's webhook secrets, as their own server would.
  const secrets = (await listApps(ownerId)).flatMap((a) => (a.webhook ? [a.webhook.secret] : []));
  const sig = (r: BinRequest) => r.headers["convene-signature"] ?? null;
  return reqs.map((r) => ({ ...r, verified: sig(r) ? secrets.some((s) => verify(s, r.body, sig(r), r.at)) : null }));
}
