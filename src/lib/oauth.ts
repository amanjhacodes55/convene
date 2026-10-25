import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sha256 } from "./accounts";
import { isScope, SCOPES, type Scope } from "./catalog";
import { RoomError } from "./errors";
import { kv } from "./store";

// The developer platform's identity layer: apps, their credentials, and OAuth 2.0.
//
// Two kinds of app, as on Zoom's marketplace:
//   "oauth"  a user installs it through the authorization-code flow (with optional PKCE), and it
//            acts for whoever authorized it.
//   "server" server-to-server: the client_credentials grant, acting for the app's own developer.
//
// Tokens are opaque random strings; only their SHA-256 is stored, as with every other secret here.
//
// Keys:
//   apps/<id>                          the app (client secret stored hashed)
//   clients/<client_id>                { appId }
//   users/<uid>/apps/<id>              { id }: the developer's apps
//   users/<uid>/grants/<appId>         a user's authorization of an app (scopes, grant id)
//   apps/<id>/grants/<uid>             the same, indexed by app, for webhook fan-out
//   oauth/codes/<sha>                  an authorization code, single use, 10 minutes
//   oauth/tokens/<sha>                 an access token (1 hour) or refresh token (90 days)

export { isScope, SCOPES, type Scope };

export type AppType = "oauth" | "server";

export type Webhook = { url: string; secret: string; events: string[]; enabled: boolean };

export type App = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  type: AppType;
  clientId: string;
  secretHash: string;
  /** Last four characters, so the developer can tell secrets apart. */
  secretHint: string;
  redirectUris: string[];
  scopes: Scope[];
  webhook: Webhook | null;
  createdAt: number;
  updatedAt: number;
};

/** An app as its developer sees it: everything except the secret hash. */
export type PublicApp = Omit<App, "secretHash">;

type Grant = { grantId: string; appId: string; userId: string; scopes: Scope[]; createdAt: number };
type Code = { appId: string; userId: string; scopes: Scope[]; redirectUri: string; redirectGiven: boolean; challenge: string | null; method: "S256" | "plain"; grantId: string; expiresAt: number; used?: boolean };
type Token = { kind: "access" | "refresh"; appId: string; userId: string; scopes: Scope[]; grantId: string | null; expiresAt: number };

export const ACCESS_TTL = 3600;
const REFRESH_TTL = 90 * 86_400;
const CODE_TTL = 600;

const appKey = (id: string) => `apps/${id}`;
const rand = (n: number) => randomBytes(n).toString("base64url");
const hidden = (s: string) => `${"•".repeat(8)}${s.slice(-4)}`;
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const toPublic = ({ secretHash: _, ...app }: App): PublicApp => app; // eslint-disable-line @typescript-eslint/no-unused-vars

export const oauthError = (status: number, code: string, message: string) => Object.assign(new RoomError(status, message), { code });

// ---- apps ------------------------------------------------------------------------------------

function cleanScopes(v: unknown): Scope[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,]+/) : [];
  return [...new Set(list.filter((s): s is Scope => typeof s === "string" && isScope(s)))];
}

/** Redirect URIs must be absolute https URLs; plain http only for this machine, for development. */
export function cleanRedirects(v: unknown): string[] {
  const list = (Array.isArray(v) ? v : typeof v === "string" ? v.split(/\s+/) : []).filter((s): s is string => typeof s === "string" && s.trim() !== "");
  return [...new Set(list.map((s) => s.trim()))].slice(0, 10).map((s) => {
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      throw new RoomError(400, `"${s}" is not a valid URL.`);
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) throw new RoomError(400, `Redirect URIs must use https (http is allowed for localhost): ${s}`);
    if (u.hash) throw new RoomError(400, "Redirect URIs can't contain a #fragment.");
    return u.toString();
  });
}

export async function createApp(ownerId: string, input: { name?: unknown; description?: unknown; type?: unknown; redirectUris?: unknown; scopes?: unknown }, now = Date.now()) {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
  if (!name) throw new RoomError(400, "Give your app a name.");
  const type: AppType = input.type === "server" ? "server" : "oauth";
  const secret = `cvn_cs_${rand(30)}`;
  const app: App = {
    id: randomBytes(8).toString("hex"),
    ownerId,
    name,
    description: typeof input.description === "string" ? input.description.trim().slice(0, 300) : "",
    type,
    clientId: `cvn_${rand(15)}`,
    secretHash: sha256(secret),
    secretHint: hidden(secret),
    redirectUris: type === "oauth" ? cleanRedirects(input.redirectUris) : [],
    scopes: cleanScopes(input.scopes ?? ["user:read", "meeting:read"]),
    webhook: null,
    createdAt: now,
    updatedAt: now,
  };
  await kv().set(appKey(app.id), app);
  await kv().set(`clients/${app.clientId}`, { appId: app.id });
  await kv().set(`users/${ownerId}/apps/${app.id}`, { id: app.id });
  return { app: toPublic(app), clientSecret: secret };
}

export const getApp = (id: string) => (/^[0-9a-f]{16}$/.test(id) ? kv().get<App>(appKey(id)) : Promise.resolve(null));

/** The developer's own app, or a 404 for anyone else's. */
export async function ownApp(ownerId: string, id: string) {
  const app = await getApp(id);
  if (!app || app.ownerId !== ownerId) throw new RoomError(404, "App not found.");
  return app;
}

export async function listApps(ownerId: string) {
  const refs = await kv().list(`users/${ownerId}/apps/`);
  const apps = await Promise.all(refs.map((k) => getApp(k.split("/").pop()!)));
  return apps.filter((a): a is App => a !== null).sort((a, b) => b.createdAt - a.createdAt);
}

/** `origin` is this site's address: the built-in test inbox lives there. */
export async function updateApp(ownerId: string, id: string, input: Record<string, unknown>, now = Date.now(), origin?: string) {
  const app = await ownApp(ownerId, id);
  const next: App = { ...app, updatedAt: now };
  if (typeof input.name === "string") next.name = input.name.trim().slice(0, 60) || app.name;
  if (typeof input.description === "string") next.description = input.description.trim().slice(0, 300);
  if (input.redirectUris !== undefined && app.type === "oauth") next.redirectUris = cleanRedirects(input.redirectUris);
  if (input.scopes !== undefined) next.scopes = cleanScopes(input.scopes);
  if (input.webhook !== undefined) next.webhook = cleanWebhook(input.webhook, app.webhook, origin);
  await kv().set(appKey(id), next);
  return toPublic(next);
}

function cleanWebhook(v: unknown, prev: Webhook | null, origin?: string): Webhook | null {
  if (v === null) return null;
  const w = (v ?? {}) as Record<string, unknown>;
  const url = typeof w.url === "string" ? w.url.trim() : prev?.url ?? "";
  if (url) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new RoomError(400, "Enter a valid endpoint URL.");
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    // The built-in test inbox is this site itself, which is localhost when running locally. Only
    // this site's own origin is exempt, never a path on some other host.
    const inbox = Boolean(origin) && u.origin === origin && /^\/api\/bins\/[0-9a-f]{20}$/.test(u.pathname);
    const prod = process.env.NODE_ENV === "production" && !inbox;
    if (u.protocol !== "https:" && !(u.protocol === "http:" && (local || !prod))) throw new RoomError(400, "Webhook endpoints must use https.");
    // A first line against server-side request forgery: no loopback, private or link-local addresses.
    if (prod && (local || privateHost(u.hostname))) throw new RoomError(400, "Webhook endpoints must be public addresses.");
  }
  return {
    url,
    // A secret token per app, shown to the developer, used to sign every delivery.
    secret: prev?.secret ?? `whsec_${rand(24)}`,
    events: Array.isArray(w.events) ? [...new Set(w.events.filter((e): e is string => typeof e === "string"))].slice(0, 30) : prev?.events ?? [],
    enabled: typeof w.enabled === "boolean" ? w.enabled : prev?.enabled ?? true,
  };
}

function privateHost(host: string) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h.endsWith(".local") || h.endsWith(".internal") || h === "0.0.0.0") return true;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
  if (v4) {
    const [a, b] = v4;
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return h.includes(":") && (h.startsWith("::") || h.startsWith("64:ff9b:") || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:"));
}

export async function rotateWebhookSecret(ownerId: string, id: string) {
  const app = await ownApp(ownerId, id);
  if (!app.webhook) throw new RoomError(400, "Add a webhook endpoint first.");
  const next = { ...app, webhook: { ...app.webhook, secret: `whsec_${rand(24)}` } };
  await kv().set(appKey(id), next);
  return toPublic(next);
}

export async function rotateSecret(ownerId: string, id: string, now = Date.now()) {
  const app = await ownApp(ownerId, id);
  const secret = `cvn_cs_${rand(30)}`;
  const next = { ...app, secretHash: sha256(secret), secretHint: hidden(secret), updatedAt: now };
  await kv().set(appKey(id), next);
  return { app: toPublic(next), clientSecret: secret };
}

export async function deleteApp(ownerId: string, id: string) {
  const app = await ownApp(ownerId, id);
  const store = kv();
  // Uninstall it everywhere: every user's authorization goes, and with it every token.
  for (const k of await store.list(`apps/${id}/grants/`)) {
    await store.delete(`users/${k.split("/").pop()}/grants/${id}`);
    await store.delete(k);
  }
  for (const k of await store.list(`apps/${id}/deliveries/`)) await store.delete(k);
  await store.delete(`clients/${app.clientId}`);
  await store.delete(`users/${ownerId}/apps/${id}`);
  await store.delete(appKey(id));
}

async function appByClient(clientId: unknown) {
  const ref = typeof clientId === "string" ? await kv().get<{ appId: string }>(`clients/${clientId}`) : null;
  return ref ? getApp(ref.appId) : null;
}

// ---- authorization --------------------------------------------------------------------------

export type AuthorizeParams = { response_type?: string | null; client_id?: string | null; redirect_uri?: string | null; scope?: string | null; state?: string | null; code_challenge?: string | null; code_challenge_method?: string | null };

/**
 * Checks an authorization request. Problems with the client or redirect URI are shown on the page
 * (never redirected, so an attacker can't bounce users through Convene); the rest go back to the app.
 */
export async function checkAuthorize(p: AuthorizeParams) {
  const app = await appByClient(p.client_id);
  if (!app || app.type !== "oauth") throw oauthError(400, "invalid_client", "This app doesn't exist, or it isn't an OAuth app.");
  const redirectUri = p.redirect_uri || (app.redirectUris.length === 1 ? app.redirectUris[0] : "");
  if (!redirectUri || !app.redirectUris.includes(redirectUri)) throw oauthError(400, "invalid_redirect_uri", "The redirect URI isn't registered for this app.");
  if (p.response_type !== "code") return { app, redirectUri, error: "unsupported_response_type" as const };
  // No scope asked for means everything the app is configured with; asking for more is refused.
  const asked = p.scope ? p.scope.split(/[\s,]+/).filter(Boolean) : app.scopes;
  const scopes = cleanScopes(asked);
  if (asked.some((s) => !isScope(s) || !app.scopes.includes(s as Scope))) return { app, redirectUri, error: "invalid_scope" as const };
  if (p.code_challenge_method && !["S256", "plain"].includes(p.code_challenge_method)) return { app, redirectUri, error: "invalid_request" as const };
  return { app, redirectUri, scopes, error: null };
}

/** The user said yes: record the grant and hand back a code for the app's redirect. */
export async function approve(userId: string, p: AuthorizeParams, now = Date.now()) {
  const c = await checkAuthorize(p);
  if (c.error || !c.scopes) throw oauthError(400, c.error ?? "invalid_request", "Invalid authorization request.");
  const store = kv();
  const prev = await store.get<Grant>(`users/${userId}/grants/${c.app.id}`);
  // Re-authorizing widens an existing grant rather than replacing it, and keeps its tokens valid.
  const grant: Grant = { grantId: prev?.grantId ?? rand(12), appId: c.app.id, userId, scopes: [...new Set([...(prev?.scopes ?? []), ...c.scopes])], createdAt: prev?.createdAt ?? now };
  await store.set(`users/${userId}/grants/${c.app.id}`, grant);
  await store.set(`apps/${c.app.id}/grants/${userId}`, { userId });
  const code = `cvn_ac_${rand(24)}`;
  await store.set(`oauth/codes/${sha256(code)}`, {
    appId: c.app.id,
    userId,
    scopes: c.scopes,
    redirectUri: c.redirectUri,
    redirectGiven: Boolean(p.redirect_uri),
    challenge: p.code_challenge || null,
    method: p.code_challenge_method === "plain" ? "plain" : "S256",
    grantId: grant.grantId,
    expiresAt: now + CODE_TTL * 1000,
  } satisfies Code);
  return withParams(c.redirectUri, { code, state: p.state });
}

export function withParams(uri: string, params: Record<string, string | null | undefined>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

// ---- tokens ---------------------------------------------------------------------------------

async function issue(app: App, userId: string, scopes: Scope[], grantId: string | null, now: number, refresh = true) {
  const store = kv();
  const access = `cvn_at_${rand(32)}`;
  await store.set(`oauth/tokens/${sha256(access)}`, { kind: "access", appId: app.id, userId, scopes, grantId, expiresAt: now + ACCESS_TTL * 1000 } satisfies Token);
  const out: Record<string, unknown> = { access_token: access, token_type: "bearer", expires_in: ACCESS_TTL, scope: scopes.join(" ") };
  if (refresh) {
    const rt = `cvn_rt_${rand(32)}`;
    await store.set(`oauth/tokens/${sha256(rt)}`, { kind: "refresh", appId: app.id, userId, scopes, grantId, expiresAt: now + REFRESH_TTL * 1000 } satisfies Token);
    out.refresh_token = rt;
  }
  return out;
}

/** The token endpoint: authorization_code, refresh_token and client_credentials. */
export async function token(params: Record<string, string | undefined>, basic: { id: string; secret: string } | null, now = Date.now()) {
  const clientId = basic?.id ?? params.client_id;
  const secret = basic?.secret ?? params.client_secret;
  const app = await appByClient(clientId);
  if (!app || !secret || !safeEq(sha256(secret), app.secretHash)) throw oauthError(401, "invalid_client", "Client authentication failed.");
  const store = kv();

  if (params.grant_type === "client_credentials") {
    if (app.type !== "server") throw oauthError(400, "unauthorized_client", "Only server-to-server apps can use client_credentials.");
    return issue(app, app.ownerId, app.scopes, null, now, false);
  }

  if (params.grant_type === "authorization_code") {
    const key = `oauth/codes/${sha256(params.code ?? "")}`;
    const code = await store.get<Code>(key);
    if (!code || code.appId !== app.id || code.expiresAt < now) throw oauthError(400, "invalid_grant", "The authorization code is invalid or has expired.");
    if (code.used) {
      // A code used twice may have been stolen (RFC 6749 §4.1.2): cut off every token from this grant.
      await rotateGrant(code.userId, code.appId, code.grantId);
      throw oauthError(400, "invalid_grant", "The authorization code has already been used.");
    }
    await store.set(key, { ...code, used: true }); // single use, even when the exchange fails
    if (code.redirectGiven ? params.redirect_uri !== code.redirectUri : params.redirect_uri && params.redirect_uri !== code.redirectUri) {
      throw oauthError(400, "invalid_grant", "redirect_uri must match the one in the authorization request.");
    }
    if (code.challenge) {
      const v = params.code_verifier ?? "";
      const derived = code.method === "plain" ? v : createHash("sha256").update(v).digest("base64url");
      if (!v || !safeEq(derived, code.challenge)) throw oauthError(400, "invalid_grant", "The PKCE code_verifier doesn't match.");
    }
    return issue(app, code.userId, code.scopes, code.grantId, now);
  }

  if (params.grant_type === "refresh_token") {
    const key = `oauth/tokens/${sha256(params.refresh_token ?? "")}`;
    const t = await store.get<Token>(key);
    if (!t || t.kind !== "refresh" || t.appId !== app.id || t.expiresAt < now || !(await grantLive(t))) throw oauthError(400, "invalid_grant", "The refresh token is invalid or has been revoked.");
    await store.delete(key); // rotated: each refresh token works once
    return issue(app, t.userId, t.scopes, t.grantId, now);
  }

  throw oauthError(400, "unsupported_grant_type", "grant_type must be authorization_code, refresh_token or client_credentials.");
}

/** Gives a grant a new id, which invalidates every token issued under the old one. */
async function rotateGrant(userId: string, appId: string, grantId: string) {
  const g = await kv().get<Grant>(`users/${userId}/grants/${appId}`);
  if (g?.grantId === grantId) await kv().set(`users/${userId}/grants/${appId}`, { ...g, grantId: rand(12) });
}

async function grantLive(t: Token) {
  if (!t.grantId) return (await getApp(t.appId)) !== null;
  const g = await kv().get<Grant>(`users/${t.userId}/grants/${t.appId}`);
  return g?.grantId === t.grantId;
}

export type Caller = { userId: string; appId: string; scopes: Scope[] };

/** Resolves an Authorization: Bearer header to the user and app it acts for. */
export async function bearer(header: string | null, now = Date.now()): Promise<Caller> {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  if (!m) throw oauthError(401, "unauthorized", "Send an access token in the Authorization header: Bearer <token>.");
  const t = await kv().get<Token>(`oauth/tokens/${sha256(m[1])}`);
  if (!t || t.kind !== "access" || t.expiresAt < now || !(await grantLive(t))) throw oauthError(401, "invalid_token", "The access token is invalid, expired or revoked.");
  return { userId: t.userId, appId: t.appId, scopes: t.scopes };
}

/** RFC 7009: revoking an unknown token is not an error. */
export async function revokeToken(tok: string) {
  await kv().delete(`oauth/tokens/${sha256(tok)}`);
}

/** A short-lived token for the developer's own account, for trying the API from the portal. */
export async function testToken(ownerId: string, id: string, now = Date.now()) {
  const app = await ownApp(ownerId, id);
  return issue(app, ownerId, app.scopes, null, now, false);
}

// ---- a user's authorized apps ---------------------------------------------------------------

export async function listGrants(userId: string) {
  const store = kv();
  const grants = await Promise.all((await store.list(`users/${userId}/grants/`)).map((k) => store.get<Grant>(k, { listed: true })));
  const out = [];
  for (const g of grants) {
    const app = g && (await getApp(g.appId));
    if (g && app) out.push({ appId: app.id, name: app.name, description: app.description, scopes: g.scopes, authorizedAt: g.createdAt });
  }
  return out;
}

export async function revokeGrant(userId: string, appId: string) {
  // The grant id lives in the grant; once it's gone, every token minted under it stops working.
  await kv().delete(`users/${userId}/grants/${appId}`);
  await kv().delete(`apps/${appId}/grants/${userId}`);
}

/** Apps that should hear about this user's meetings: their own, and the ones they've authorized. */
export async function appsListening(userId: string) {
  const store = kv();
  const own = await listApps(userId);
  const grants = await Promise.all((await store.list(`users/${userId}/grants/`)).map((k) => store.get<Grant>(k, { listed: true })));
  const authorized = [];
  for (const g of grants) {
    if (!g || own.some((a) => a.id === g.appId)) continue;
    const app = await getApp(g.appId);
    if (app) authorized.push({ app, scopes: g.scopes });
  }
  return [...own.map((app) => ({ app, scopes: app.scopes })), ...authorized];
}
