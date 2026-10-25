import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isCode } from "./codes";
import { RoomError } from "./errors";
import { kv } from "./store";
import { emit, type EventName } from "./webhooks";

// Meetings are coordinated through the store; audio and video never touch the server. Each
// participant ("peer") polls an inbox that holds signalling messages from other peers (WebRTC
// offers, answers and ICE candidates) and room events from the server (joins, leaves, admissions).
//
// Keys:
//   rooms/<code>/meta                       the room
//   rooms/<code>/peers/<id>                 one participant
//   rooms/<code>/inbox/<to>/<from>-<seq>    one message from a peer; per-sender order comes from <seq>
//   rooms/<code>/inbox/<to>/!<time>         one message from the server
//   rooms/<code>/attendance/<id>            when one participant joined and left, for reports
//   users/<uid>/meetings/<code>             { code }: an account's meetings
//
// Meetings started from the home page have no owner. Meetings made from an account (the dashboard or
// the REST API) do: the owner is their host on any device, and their apps get webhooks about them.

export type RoomMeta = {
  code: string;
  title: string;
  createdAt: number;
  hostKeyHash: string;
  locked: boolean;
  waitingRoom: boolean;
  endedAt: number | null;
  ownerId?: string | null;
  /** When a scheduled meeting is due to start, and for how many minutes. */
  scheduledFor?: number | null;
  duration?: number | null;
  agenda?: string;
  /** When the first participant joined. */
  startedAt?: number | null;
  /** The site's address when the meeting was made, for join links in webhooks. */
  origin?: string;
  /** The app that made it through the API, if any. */
  appId?: string | null;
};

export type Attendance = { id: string; name: string; host: boolean; joinedAt: number; leftAt: number | null; reason: "left" | "removed" | "ended" | null };

export type PeerStatus = "waiting" | "admitted" | "denied" | "removed";

type Peer = { id: string; name: string; joinedAt: number; lastSeen: number; status: PeerStatus; host: boolean; tokenHash: string };

export type PublicPeer = { id: string; name: string; joinedAt: number; host: boolean };

export type Message = { id: string; from: string; type: string; data?: unknown };

export type Settings = { locked: boolean; waitingRoom: boolean };

export { RoomError };

/** A peer that has not polled for this long is treated as gone. */
export const STALE_MS = 35_000;
const HEARTBEAT_MS = 10_000;
const MAX_NAME = 40;
const MAX_TITLE = 80;
const MAX_AGENDA = 2000;
export const MAX_SIGNAL_BYTES = 64_000;

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(24).toString("base64url");
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
const pub = (p: Peer): PublicPeer => ({ id: p.id, name: p.name, joinedAt: p.joinedAt, host: p.host });

const metaKey = (code: string) => `rooms/${code}/meta`;
const peerKey = (code: string, id: string) => `rooms/${code}/peers/${id}`;
const inboxPrefix = (code: string, to: string) => `rooms/${code}/inbox/${to}/`;
const attendanceKey = (code: string, id: string) => `rooms/${code}/attendance/${id}`;

// ---- codes ------------------------------------------------------------------------------------

const LETTERS = "abcdefghijkmnopqrstuvwxyz"; // no "l": it reads like a 1 or an I

/** A meeting code like "kfa-wqpz-tnu": easy to read out loud, ~10^14 possibilities. */
export function newCode(): string {
  const bytes = randomBytes(10);
  const pick = (i: number) => LETTERS[bytes[i] % LETTERS.length];
  const part = (from: number, n: number) => Array.from({ length: n }, (_, i) => pick(from + i)).join("");
  return `${part(0, 3)}-${part(3, 4)}-${part(7, 3)}`;
}

export { isCode };

// ---- rooms -----------------------------------------------------------------------------------

export type NewRoom = {
  title?: string;
  waitingRoom?: boolean;
  ownerId?: string | null;
  scheduledFor?: number | null;
  duration?: number | null;
  agenda?: string;
  origin?: string;
  appId?: string | null;
};

export async function createRoom(input: NewRoom, now = Date.now()) {
  const code = newCode();
  const hostKey = token();
  const meta: RoomMeta = {
    code,
    title: clean(input.title, MAX_TITLE) || "Meeting",
    createdAt: now,
    hostKeyHash: hash(hostKey),
    locked: false,
    waitingRoom: input.waitingRoom ?? false,
    endedAt: null,
    ownerId: input.ownerId ?? null,
    scheduledFor: input.scheduledFor ?? null,
    duration: input.duration ?? null,
    agenda: typeof input.agenda === "string" ? input.agenda.trim().slice(0, MAX_AGENDA) : "",
    startedAt: null,
    origin: input.origin,
    appId: input.appId ?? null,
  };
  await kv().set(metaKey(code), meta);
  if (meta.ownerId) {
    await kv().set(`users/${meta.ownerId}/meetings/${code}`, { code });
    emit(meta.ownerId, "meeting.created", { meeting: meetingJson(meta) }, now);
  }
  return { code, hostKey, title: meta.title };
}

/** A meeting as the REST API and webhooks describe it. */
export function meetingJson(m: RoomMeta) {
  const origin = m.origin ?? process.env.URL ?? "";
  return {
    id: m.code,
    topic: m.title,
    agenda: m.agenda ?? "",
    status: m.endedAt ? "ended" : m.startedAt ? "started" : "waiting",
    start_time: m.scheduledFor ? new Date(m.scheduledFor).toISOString() : null,
    duration: m.duration ?? null,
    created_at: new Date(m.createdAt).toISOString(),
    started_at: m.startedAt ? new Date(m.startedAt).toISOString() : null,
    ended_at: m.endedAt ? new Date(m.endedAt).toISOString() : null,
    join_url: `${origin}/m/${m.code}`,
    settings: { waiting_room: m.waitingRoom, locked: m.locked },
  };
}

/** Emits an event about a meeting to its owner's apps, if it has an owner. */
function tell(meta: RoomMeta, event: EventName, extra: Record<string, unknown>, now: number) {
  emit(meta.ownerId, event, { meeting: meetingJson(meta), ...extra }, now);
}

const participantJson = (p: Pick<Peer, "id" | "name" | "host">, at: number) => ({ id: p.id, name: p.name, host: p.host, at: new Date(at).toISOString() });

export async function getRoom(code: string): Promise<RoomMeta> {
  const meta = isCode(code) ? await kv().get<RoomMeta>(metaKey(code)) : null;
  if (!meta) throw new RoomError(404, "This meeting doesn't exist. Check the code or link.");
  return meta;
}

export async function roomInfo(code: string, userId?: string | null) {
  const meta = await getRoom(code);
  return {
    code,
    title: meta.title,
    locked: meta.locked,
    waitingRoom: meta.waitingRoom,
    ended: meta.endedAt !== null,
    scheduledFor: meta.scheduledFor ?? null,
    owner: Boolean(userId && meta.ownerId === userId),
  };
}

async function peers(code: string): Promise<Peer[]> {
  const store = kv();
  const keys = await store.list(`rooms/${code}/peers/`);
  const all = await Promise.all(keys.map((k) => store.get<Peer>(k)));
  return all.filter((p): p is Peer => p !== null);
}

const live = (p: Peer, now: number) => now - p.lastSeen < STALE_MS;

/** Admitted participants who are still polling. */
async function inMeeting(code: string, now: number, except?: string) {
  return (await peers(code)).filter((p) => p.status === "admitted" && live(p, now) && p.id !== except);
}

let serverSeq = 0;
/** Server messages sort after anything already queued and in the order they were sent. */
function serverKey(now: number) {
  serverSeq = (serverSeq + 1) % 1000;
  return `${now.toString().padStart(15, "0")}${serverSeq.toString().padStart(3, "0")}${randomBytes(2).toString("hex")}`;
}

async function notify(code: string, to: string[], type: string, data: unknown, now: number) {
  const store = kv();
  // "!" sorts before every peer id, so a join notice is always read before that peer's first offer.
  await Promise.all(to.map((id) => store.set(`${inboxPrefix(code, id)}!${serverKey(now)}`, { from: "server", type, data })));
}

export async function join(code: string, input: { name?: unknown; hostKey?: unknown; userId?: string | null }, now = Date.now()) {
  let meta = await getRoom(code);
  if (meta.endedAt) throw new RoomError(410, "This meeting has ended.");
  const name = clean(input.name, MAX_NAME);
  if (!name) throw new RoomError(400, "Enter your name to join.");
  const host = (typeof input.hostKey === "string" && sameHash(hash(input.hostKey), meta.hostKeyHash)) || Boolean(input.userId && meta.ownerId === input.userId);
  if (meta.locked && !host) throw new RoomError(423, "The host has locked this meeting.");

  const others = await inMeeting(code, now);
  const hostHere = others.some((p) => p.host);
  // With nobody to let them in, guests are admitted directly rather than waiting forever.
  const status: PeerStatus = meta.waitingRoom && !host && hostHere ? "waiting" : "admitted";
  const secret = token();
  const peer: Peer = { id: randomBytes(8).toString("hex"), name, joinedAt: now, lastSeen: now, status, host, tokenHash: hash(secret) };
  await kv().set(peerKey(code, peer.id), peer);

  if (status === "admitted") {
    await notify(code, others.map((p) => p.id), "peer-joined", pub(peer), now);
    meta = await arrived(meta, peer, now);
  } else {
    await notify(code, others.filter((p) => p.host).map((p) => p.id), "knock", pub(peer), now);
    tell(meta, "participant.waiting", { participant: participantJson(peer, now) }, now);
  }

  return {
    peer: pub(peer),
    token: secret,
    status,
    title: meta.title,
    settings: { locked: meta.locked, waitingRoom: meta.waitingRoom } satisfies Settings,
    peers: status === "admitted" ? others.map(pub) : [],
    waiting: host ? (await peers(code)).filter((p) => p.status === "waiting" && live(p, now)).map(pub) : [],
  };
}

/** Someone is in: note it for the report, and mark the meeting started on its first arrival. */
async function arrived(meta: RoomMeta, peer: Peer, now: number) {
  await kv().set(attendanceKey(meta.code, peer.id), { id: peer.id, name: peer.name, host: peer.host, joinedAt: now, leftAt: null, reason: null } satisfies Attendance);
  if (!meta.startedAt) {
    meta = { ...(await getRoom(meta.code)), startedAt: now };
    await kv().set(metaKey(meta.code), meta);
    tell(meta, "meeting.started", {}, now);
  }
  tell(meta, "participant.joined", { participant: participantJson(peer, now) }, now);
  return meta;
}

async function departed(meta: RoomMeta, peer: Pick<Peer, "id" | "name" | "host">, reason: Attendance["reason"], now: number) {
  const a = await kv().get<Attendance>(attendanceKey(meta.code, peer.id));
  if (a && !a.leftAt) await kv().set(attendanceKey(meta.code, peer.id), { ...a, leftAt: now, reason });
  if (reason !== "ended") tell(meta, "participant.left", { participant: { ...participantJson(peer, now), reason } }, now);
}

/** The calling peer, if its token matches. */
export async function authenticate(code: string, id: unknown, secret: unknown): Promise<Peer> {
  const peer = typeof id === "string" && /^[0-9a-f]{16}$/.test(id) ? await kv().get<Peer>(peerKey(code, id)) : null;
  if (!peer || typeof secret !== "string" || !sameHash(hash(secret), peer.tokenHash)) throw new RoomError(401, "Not in this meeting.");
  return peer;
}

/** Relays a batch of signalling messages from one admitted peer to another. */
export async function signal(code: string, from: Peer, to: unknown, seq: unknown, data: unknown, now = Date.now()) {
  if (from.status !== "admitted") throw new RoomError(403, "Wait for the host to let you in.");
  if (typeof to !== "string" || !Number.isSafeInteger(seq) || (seq as number) < 0) throw new RoomError(400, "Bad message.");
  if (JSON.stringify(data ?? null).length > MAX_SIGNAL_BYTES) throw new RoomError(413, "Message too large.");
  const target = await kv().get<Peer>(peerKey(code, to));
  if (!target || target.status !== "admitted" || !live(target, now)) throw new RoomError(404, "That participant has left.");
  await kv().set(`${inboxPrefix(code, to)}${from.id}-${String(seq).padStart(12, "0")}`, { from: from.id, type: "signal", data });
}

/**
 * Deletes the messages the peer has processed, then returns the rest of its inbox. A response lost
 * on the way back is harmless: unacknowledged messages come again, and the client skips repeats.
 */
export async function poll(code: string, peer: Peer, ack: unknown, now = Date.now()) {
  const store = kv();
  const prefix = inboxPrefix(code, peer.id);
  if (Array.isArray(ack)) {
    const ids = ack.filter((a): a is string => typeof a === "string" && !a.includes("/")).slice(0, 500);
    await Promise.all(ids.map((id) => store.delete(prefix + id)));
  }
  if (now - peer.lastSeen > HEARTBEAT_MS) await store.set(peerKey(code, peer.id), { ...peer, lastSeen: now });
  const meta = await getRoom(code);
  const keys = (await store.list(prefix)).slice(0, 200);
  const messages = (await Promise.all(keys.map(async (k) => ({ ...(await store.get<Omit<Message, "id">>(k)), id: k.slice(prefix.length) }))))
    .filter((m): m is Message => typeof m.type === "string");
  return { status: peer.status, ended: meta.endedAt !== null, messages };
}

export async function leave(code: string, peer: Peer, now = Date.now()) {
  const store = kv();
  await store.delete(peerKey(code, peer.id));
  const prefix = inboxPrefix(code, peer.id);
  await Promise.all((await store.list(prefix)).map((k) => store.delete(k)));
  const others = await inMeeting(code, now, peer.id);
  if (peer.status === "admitted") {
    await notify(code, others.map((p) => p.id), "peer-left", { id: peer.id }, now);
    await departed(await getRoom(code), peer, "left", now);
  }
  if (peer.status === "waiting") await notify(code, others.filter((p) => p.host).map((p) => p.id), "knock-cancelled", { id: peer.id }, now);
}

// ---- host controls ---------------------------------------------------------------------------

export type HostAction =
  | { action: "admit" | "deny" | "remove"; target: string }
  | { action: "settings"; locked?: boolean; waitingRoom?: boolean }
  | { action: "end" };

export async function hostAction(code: string, host: Peer, input: HostAction, now = Date.now()) {
  if (!host.host || host.status !== "admitted") throw new RoomError(403, "Only the host can do that.");
  const store = kv();
  const meta = await getRoom(code);
  if (meta.endedAt) throw new RoomError(409, "This meeting has ended.");

  if (input.action === "settings") {
    const next = { ...meta, locked: input.locked ?? meta.locked, waitingRoom: input.waitingRoom ?? meta.waitingRoom };
    await store.set(metaKey(code), next);
    const everyone = await inMeeting(code, now);
    await notify(code, everyone.map((p) => p.id), "settings", { locked: next.locked, waitingRoom: next.waitingRoom }, now);
    return;
  }

  if (input.action === "end") {
    await endRoom(meta, now, host.id);
    return;
  }

  const target = await store.get<Peer>(peerKey(code, input.target));
  if (!target || target.id === host.id) throw new RoomError(404, "That participant has left.");
  const others = await inMeeting(code, now, target.id);
  const otherHosts = others.filter((p) => p.host && p.id !== host.id).map((p) => p.id);

  if (input.action === "admit") {
    if (target.status !== "waiting") return;
    await store.set(peerKey(code, target.id), { ...target, status: "admitted" });
    await notify(code, [target.id], "admitted", { peers: others.map(pub) }, now);
    await notify(code, others.map((p) => p.id), "peer-joined", pub(target), now);
    await notify(code, otherHosts, "knock-cancelled", { id: target.id }, now);
    await arrived(meta, target, now);
  } else if (input.action === "deny") {
    if (target.status !== "waiting") return;
    await store.set(peerKey(code, target.id), { ...target, status: "denied" });
    await notify(code, [target.id], "denied", null, now);
    await notify(code, otherHosts, "knock-cancelled", { id: target.id }, now);
  } else {
    await store.set(peerKey(code, target.id), { ...target, status: "removed" });
    await notify(code, [target.id], "removed", null, now);
    await notify(code, others.map((p) => p.id), "peer-left", { id: target.id }, now);
    if (target.status === "admitted") await departed(meta, target, "removed", now);
  }
}

async function endRoom(meta: RoomMeta, now: number, except?: string) {
  const ended = { ...meta, endedAt: now };
  await kv().set(metaKey(meta.code), ended);
  const all = await peers(meta.code);
  await notify(meta.code, all.filter((p) => live(p, now) && p.id !== except).map((p) => p.id), "ended", null, now);
  // Someone who had already dropped off left when they last polled, not when the meeting ended.
  for (const p of all) if (p.status === "admitted") await departed(ended, p, "ended", live(p, now) ? now : p.lastSeen);
  tell(ended, "meeting.ended", {}, now);
}

// ---- an account's meetings (the dashboard and the REST API) -----------------------------------

/** The account's own meeting, or a 404 for anyone else's. */
export async function ownRoom(userId: string, code: string) {
  const meta = isCode(code) ? await kv().get<RoomMeta>(metaKey(code)) : null;
  if (!meta || meta.ownerId !== userId) throw new RoomError(404, "Meeting not found.");
  return meta;
}

export async function listRooms(userId: string) {
  const store = kv();
  const refs = await store.list(`users/${userId}/meetings/`);
  const metas = await Promise.all(refs.map((k) => store.get<RoomMeta>(metaKey(k.split("/").pop()!))));
  return metas.filter((m): m is RoomMeta => m !== null).sort((a, b) => (b.scheduledFor ?? b.createdAt) - (a.scheduledFor ?? a.createdAt));
}

export type RoomPatch = { title?: string; agenda?: string; scheduledFor?: number | null; duration?: number | null; waitingRoom?: boolean; locked?: boolean };

export async function updateRoom(userId: string, code: string, patch: RoomPatch, now = Date.now()) {
  const meta = await ownRoom(userId, code);
  if (meta.endedAt) throw new RoomError(409, "This meeting has ended and can't be changed.");
  const next: RoomMeta = {
    ...meta,
    title: patch.title !== undefined ? clean(patch.title, MAX_TITLE) || meta.title : meta.title,
    agenda: patch.agenda !== undefined ? patch.agenda.trim().slice(0, MAX_AGENDA) : meta.agenda,
    scheduledFor: patch.scheduledFor !== undefined ? patch.scheduledFor : meta.scheduledFor,
    duration: patch.duration !== undefined ? patch.duration : meta.duration,
    waitingRoom: patch.waitingRoom ?? meta.waitingRoom,
    locked: patch.locked ?? meta.locked,
  };
  await kv().set(metaKey(code), next);
  if (next.waitingRoom !== meta.waitingRoom || next.locked !== meta.locked) {
    const everyone = await inMeeting(code, now);
    await notify(code, everyone.map((p) => p.id), "settings", { locked: next.locked, waitingRoom: next.waitingRoom }, now);
  }
  tell(next, "meeting.updated", {}, now);
  return next;
}

export async function deleteRoom(userId: string, code: string, now = Date.now()) {
  const meta = await ownRoom(userId, code);
  // Deleting wipes the inboxes, so people still in the call would never hear it ended.
  if (!meta.endedAt && (await inMeeting(code, now)).length) throw new RoomError(409, "This meeting is live. End it first, then delete it.");
  const store = kv();
  for (const k of await store.list(`rooms/${code}/`)) await store.delete(k);
  await store.delete(`users/${userId}/meetings/${code}`);
  tell(meta, "meeting.deleted", {}, now);
}

/** Ends an account's meeting from outside it (the API), for everyone. */
export async function endOwnRoom(userId: string, code: string, now = Date.now()) {
  const meta = await ownRoom(userId, code);
  if (meta.endedAt) throw new RoomError(409, "This meeting has already ended.");
  await endRoom(meta, now);
}

/** Who is in the meeting and the waiting room right now. */
export async function liveParticipants(code: string, now = Date.now()) {
  const all = (await peers(code)).filter((p) => live(p, now)).sort((a, b) => a.joinedAt - b.joinedAt);
  const out = (p: Peer) => ({ id: p.id, name: p.name, host: p.host, joined_at: new Date(p.joinedAt).toISOString() });
  return { participants: all.filter((p) => p.status === "admitted").map(out), waiting: all.filter((p) => p.status === "waiting").map(out) };
}

/** Everyone who has been in the meeting, with how long they stayed. */
export async function attendance(code: string, now = Date.now()) {
  const store = kv();
  const rows = (await Promise.all((await store.list(`rooms/${code}/attendance/`)).map((k) => store.get<Attendance>(k)))).filter((a): a is Attendance => a !== null);
  // Someone who closed the tab without saying goodbye left when they last polled.
  const peerSeen = new Map((await peers(code)).map((p) => [p.id, p]));
  return rows
    .map((a) => {
      const p = peerSeen.get(a.id);
      const leftAt = a.leftAt ?? (p && live(p, now) ? null : (p?.lastSeen ?? a.joinedAt));
      return { id: a.id, name: a.name, host: a.host, joined_at: new Date(a.joinedAt).toISOString(), left_at: leftAt ? new Date(leftAt).toISOString() : null, duration: Math.round(((leftAt ?? now) - a.joinedAt) / 1000), reason: a.reason };
    })
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
}

/** A message from an app, shown in the meeting's chat for everyone who is in it. */
export async function postAppMessage(code: string, app: { id: string; name: string }, text: unknown, now = Date.now()) {
  const body = typeof text === "string" ? text.trim().slice(0, 2000) : "";
  if (!body) throw new RoomError(400, "text is required.");
  const meta = await getRoom(code);
  if (meta.endedAt) throw new RoomError(409, "This meeting has ended.");
  const everyone = await inMeeting(code, now);
  if (!everyone.length) throw new RoomError(409, "Nobody is in this meeting right now.");
  const id = randomBytes(6).toString("hex");
  await notify(code, everyone.map((p) => p.id), "app-message", { id, app: app.name, appId: app.id, text: body, at: now }, now);
  return { id, delivered_to: everyone.length };
}
