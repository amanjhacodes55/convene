import { getUser, publicUser, type User } from "./accounts";
import { RoomError } from "./errors";
import { getApp, bearer, type Caller, type Scope } from "./oauth";
import type { RoomPatch } from "./rooms";

// The public REST API (/api/v1): Bearer tokens, scopes, and errors shaped as
//   { "error": { "code": "...", "message": "..." } }
// so integrations can branch on the code. Cookies are never read here, so it is open to any origin.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Cache-Control": "no-store",
};

const CODES: Record<number, string> = { 400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict", 410: "gone", 413: "too_large", 423: "locked" };

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export type Ctx = Caller & { user: User; app: { id: string; name: string } };

export async function v1(req: Request, scope: Scope | null, fn: (ctx: Ctx) => Promise<unknown>, okStatus = 200): Promise<Response> {
  try {
    const caller = await bearer(req.headers.get("authorization"));
    if (scope && !caller.scopes.includes(scope)) {
      throw Object.assign(new RoomError(403, `This token is missing the ${scope} scope.`), { code: "insufficient_scope" });
    }
    const [user, app] = await Promise.all([getUser(caller.userId), getApp(caller.appId)]);
    if (!user || !app) throw Object.assign(new RoomError(401, "The access token is invalid, expired or revoked."), { code: "invalid_token" });
    const result = await fn({ ...caller, user, app: { id: app.id, name: app.name } });
    if (result === undefined) return new Response(null, { status: 204, headers: CORS });
    return Response.json(result, { status: okStatus, headers: CORS });
  } catch (e) {
    if (e instanceof RoomError) {
      const code = (e as RoomError & { code?: string }).code ?? CODES[e.status] ?? "error";
      const headers = e.status === 401 ? { ...CORS, "WWW-Authenticate": `Bearer error="${code}"` } : CORS;
      return Response.json({ error: { code, message: e.message } }, { status: e.status, headers });
    }
    console.error(e);
    return Response.json({ error: { code: "server_error", message: "Something went wrong." } }, { status: 500, headers: CORS });
  }
}

export const me = (user: User) => publicUser(user);

/**
 * Meeting fields from an API or dashboard request body. Accepts the API's names (topic, start_time,
 * settings.waiting_room) and the dashboard's (title, scheduledFor, waitingRoom).
 */
export function meetingInput(b: Record<string, unknown>, partial = false): RoomPatch {
  const out: RoomPatch = {};
  const title = b.topic ?? b.title;
  if (title !== undefined) {
    if (typeof title !== "string") throw new RoomError(400, "topic must be a string.");
    out.title = title;
  }
  if (b.agenda !== undefined) {
    if (typeof b.agenda !== "string") throw new RoomError(400, "agenda must be a string.");
    out.agenda = b.agenda;
  }
  const start = b.start_time ?? b.scheduledFor;
  if (start !== undefined) {
    if (start === null || start === "") out.scheduledFor = null;
    else {
      const t = typeof start === "number" ? start : typeof start === "string" ? Date.parse(start) : NaN;
      if (!Number.isFinite(t)) throw new RoomError(400, "start_time must be an ISO 8601 date-time, like 2026-11-02T15:00:00Z.");
      if (t < Date.UTC(2000, 0, 1) || t > Date.UTC(2100, 0, 1)) throw new RoomError(400, "start_time must be between the years 2000 and 2100.");
      out.scheduledFor = t;
    }
  }
  if (b.duration !== undefined) {
    if (b.duration === null) out.duration = null;
    else if (!Number.isInteger(b.duration) || (b.duration as number) < 1 || (b.duration as number) > 1440) throw new RoomError(400, "duration is in minutes, from 1 to 1440.");
    else out.duration = b.duration as number;
  }
  const settings = (b.settings && typeof b.settings === "object" ? b.settings : {}) as Record<string, unknown>;
  const wr = settings.waiting_room ?? b.waitingRoom;
  if (wr !== undefined) {
    if (typeof wr !== "boolean") throw new RoomError(400, "settings.waiting_room must be true or false.");
    out.waitingRoom = wr;
  }
  if (partial && settings.locked !== undefined) {
    if (typeof settings.locked !== "boolean") throw new RoomError(400, "settings.locked must be true or false.");
    out.locked = settings.locked;
  }
  return out;
}
