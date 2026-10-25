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
  /** In-call permissions; missing fields take their defaults (see settingsOf). */
  controls?: Partial<Controls>;
  /** Shared with invitees, like a Zoom passcode; checked on join for everyone but hosts. */
  passcode?: string | null;
  /** Only people signed in to an account can join. */
  requireSignIn?: boolean;
  registration?: Registration | null;
};

/** What the host decides about everyone else, and can change during the call. */
export type Controls = {
  /** Participants don't see how many people are in the meeting. */
  hideCount: boolean;
  /** Participants see only the hosts and themselves in the participant list. */
  hideList: boolean;
  /** Who participants may chat with. */
  chat: "everyone" | "host" | "off";
  /** Who may share their screen. */
  share: "everyone" | "host";
  /** Participants may unmute themselves. */
  allowUnmute: boolean;
  /** Participants join muted. */
  muteOnEntry: boolean;
};

export const DEFAULT_CONTROLS: Controls = { hideCount: false, hideList: false, chat: "everyone", share: "everyone", allowUnmute: true, muteOnEntry: false };

/** Registration, as on Zoom: people sign up with their details first, then join with a personal link. */
export type Registration = { enabled: boolean; approval: "auto" | "manual"; requirePhone: boolean };

export type Registrant = { id: string; name: string; email: string; phone: string; status: "approved" | "pending" | "denied"; createdAt: number; tokenHash: string; userId: string | null };

export type Attendance = { id: string; name: string; host: boolean; joinedAt: number; leftAt: number | null; reason: "left" | "removed" | "ended" | null; email?: string; phone?: string };

export type PeerStatus = "waiting" | "admitted" | "denied" | "removed";

type Peer = {
  id: string;
  name: string;
  joinedAt: number;
  lastSeen: number;
  status: PeerStatus;
  host: boolean;
  /** Promoted by the host: host powers, except ending the meeting for everyone. */
  cohost?: boolean;
  tokenHash: string;
  /** Known for signed-in people and registrants, so hosts can follow up. */
  email?: string;
  phone?: string;
  userId?: string | null;
};

export type PublicPeer = { id: string; name: string; joinedAt: number; host: boolean; cohost?: boolean };

export type Message = { id: string; from: string; type: string; data?: unknown };

export type Settings = { locked: boolean; waitingRoom: boolean } & Controls;

export const settingsOf = (m: RoomMeta): Settings => ({ locked: m.locked, waitingRoom: m.waitingRoom, ...DEFAULT_CONTROLS, ...m.controls });

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
const pub = (p: Peer): PublicPeer => ({ id: p.id, name: p.name, joinedAt: p.joinedAt, host: p.host, ...(p.cohost ? { cohost: true } : {}) });
/** What hosts see about someone: their contact details as well. */
const pubForHost = (p: Peer) => ({ ...pub(p), ...(p.email ? { email: p.email } : {}), ...(p.phone ? { phone: p.phone } : {}) });

const metaKey = (code: string) => `rooms/${code}/meta`;
const peerKey = (code: string, id: string) => `rooms/${code}/peers/${id}`;
const inboxPrefix = (code: string, to: string) => `rooms/${code}/inbox/${to}/`;
const attendanceKey = (code: string, id: string) => `rooms/${code}/attendance/${id}`;
const registrantKey = (code: string, id: string) => `rooms/${code}/registrants/${id}`;

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
  controls?: Partial<Controls>;
  passcode?: string | null;
  requireSignIn?: boolean;
  registration?: Registration | null;
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
    controls: input.controls ?? {},
    passcode: input.passcode || null,
    requireSignIn: input.requireSignIn ?? false,
    registration: input.registration ?? null,
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
    join_url: `${origin}/m/${m.code}${m.passcode ? `?pwd=${encodeURIComponent(m.passcode)}` : ""}`,
    registration_url: m.registration?.enabled ? `${origin}/r/${m.code}` : null,
    passcode: m.passcode ?? null,
    settings: {
      waiting_room: m.waitingRoom,
      locked: m.locked,
      require_sign_in: m.requireSignIn ?? false,
      registration: m.registration?.enabled ? { approval: m.registration.approval, require_phone: m.registration.requirePhone } : null,
      hide_participant_count: settingsOf(m).hideCount,
      hide_participant_list: settingsOf(m).hideList,
      chat: settingsOf(m).chat,
      screen_share: settingsOf(m).share,
      allow_unmute: settingsOf(m).allowUnmute,
      mute_on_entry: settingsOf(m).muteOnEntry,
    },
  };
}

/** Emits an event about a meeting to its owner's apps, if it has an owner. */
function tell(meta: RoomMeta, event: EventName, extra: Record<string, unknown>, now: number) {
  emit(meta.ownerId, event, { meeting: meetingJson(meta), ...extra }, now);
}

const participantJson = (p: Pick<Peer, "id" | "name" | "host" | "email" | "phone">, at: number) => ({
  id: p.id,
  name: p.name,
  host: p.host,
  email: p.email ?? null,
  phone: p.phone ?? null,
  at: new Date(at).toISOString(),
});

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
    // What the lobby has to collect before joining.
    passcode: Boolean(meta.passcode),
    requireSignIn: meta.requireSignIn ?? false,
    registration: meta.registration?.enabled ? { requirePhone: meta.registration.requirePhone } : null,
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

export type JoinInput = { name?: unknown; hostKey?: unknown; userId?: string | null; email?: string | null; passcode?: unknown; registration?: unknown };

export async function join(code: string, input: JoinInput, now = Date.now()) {
  let meta = await getRoom(code);
  if (meta.endedAt) throw new RoomError(410, "This meeting has ended.");
  let name = clean(input.name, MAX_NAME);
  const host = (typeof input.hostKey === "string" && sameHash(hash(input.hostKey), meta.hostKeyHash)) || Boolean(input.userId && meta.ownerId === input.userId);
  if (meta.locked && !host) throw new RoomError(423, "The host has locked this meeting.");

  // Who they are, as far as the meeting's rules ask: hosts skip every check.
  let contact: { email?: string; phone?: string } = input.email ? { email: input.email } : {};
  if (!host) {
    if (meta.requireSignIn && !input.userId) throw new RoomError(401, "This meeting is only for signed-in users. Sign in to join.");
    if (meta.passcode && (typeof input.passcode !== "string" || input.passcode.trim() !== meta.passcode)) throw new RoomError(403, "That passcode isn't right.");
    if (meta.registration?.enabled) {
      const r = await registrantByToken(code, input.registration);
      if (!r) throw new RoomError(403, "This meeting requires registration. Register first, then join with your personal link.");
      if (r.status === "pending") throw new RoomError(403, "Your registration is waiting for the host's approval.");
      if (r.status === "denied") throw new RoomError(403, "The host declined your registration.");
      name = name || r.name;
      contact = { email: r.email, ...(r.phone ? { phone: r.phone } : {}) };
    }
  }
  if (!name) throw new RoomError(400, "Enter your name to join.");

  const others = await inMeeting(code, now);
  const hostHere = others.some((p) => p.host);
  // With nobody to let them in, guests are admitted directly rather than waiting forever.
  const status: PeerStatus = meta.waitingRoom && !host && hostHere ? "waiting" : "admitted";
  const secret = token();
  const peer: Peer = { id: randomBytes(8).toString("hex"), name, joinedAt: now, lastSeen: now, status, host, tokenHash: hash(secret), userId: input.userId ?? null, ...contact };
  await kv().set(peerKey(code, peer.id), peer);

  if (status === "admitted") {
    await announce(code, others, peer, now);
    meta = await arrived(meta, peer, now);
  } else {
    await notify(code, others.filter((p) => p.host).map((p) => p.id), "knock", pubForHost(peer), now);
    tell(meta, "participant.waiting", { participant: participantJson(peer, now) }, now);
  }

  return {
    peer: pub(peer),
    token: secret,
    status,
    title: meta.title,
    settings: settingsOf(meta),
    peers: status === "admitted" ? others.map(host ? pubForHost : pub) : [],
    waiting: host ? (await peers(code)).filter((p) => p.status === "waiting" && live(p, now)).map(pubForHost) : [],
  };
}

/** Tells everyone in the meeting about a newcomer; hosts also get their contact details. */
async function announce(code: string, to: Peer[], peer: Peer, now: number) {
  await notify(code, to.filter((p) => p.host).map((p) => p.id), "peer-joined", pubForHost(peer), now);
  await notify(code, to.filter((p) => !p.host).map((p) => p.id), "peer-joined", pub(peer), now);
}

/** Someone is in: note it for the report, and mark the meeting started on its first arrival. */
async function arrived(meta: RoomMeta, peer: Peer, now: number) {
  await kv().set(attendanceKey(meta.code, peer.id), {
    id: peer.id,
    name: peer.name,
    host: peer.host,
    joinedAt: now,
    leftAt: null,
    reason: null,
    ...(peer.email ? { email: peer.email } : {}),
    ...(peer.phone ? { phone: peer.phone } : {}),
  } satisfies Attendance);
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
  | { action: "cohost"; target: string; on: boolean }
  | ({ action: "settings"; locked?: boolean; waitingRoom?: boolean } & Partial<Controls>)
  | { action: "end" };

/** Only the fields a host may set, each checked for type. */
export function cleanControls(b: Record<string, unknown>): Partial<Controls> {
  const out: Partial<Controls> = {};
  for (const k of ["hideCount", "hideList", "allowUnmute", "muteOnEntry"] as const) if (typeof b[k] === "boolean") out[k] = b[k] as boolean;
  if (b.chat === "everyone" || b.chat === "host" || b.chat === "off") out.chat = b.chat;
  if (b.share === "everyone" || b.share === "host") out.share = b.share;
  return out;
}

export async function hostAction(code: string, host: Peer, input: HostAction, now = Date.now()) {
  if (!host.host || host.status !== "admitted") throw new RoomError(403, "Only the host can do that.");
  const store = kv();
  const meta = await getRoom(code);
  if (meta.endedAt) throw new RoomError(409, "This meeting has ended.");

  if (input.action === "settings") {
    const { action: _, locked, waitingRoom, ...controls } = input; // eslint-disable-line @typescript-eslint/no-unused-vars
    const next = { ...meta, locked: locked ?? meta.locked, waitingRoom: waitingRoom ?? meta.waitingRoom, controls: { ...meta.controls, ...cleanControls(controls) } };
    await store.set(metaKey(code), next);
    const everyone = await inMeeting(code, now);
    await notify(code, everyone.map((p) => p.id), "settings", settingsOf(next), now);
    return;
  }

  if (input.action === "end") {
    if (host.cohost) throw new RoomError(403, "Only the host can end the meeting for everyone.");
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
    await announce(code, others, target, now);
    await notify(code, otherHosts, "knock-cancelled", { id: target.id }, now);
    await arrived(meta, target, now);
  } else if (input.action === "cohost") {
    if (host.cohost) throw new RoomError(403, "Only the host can make co-hosts.");
    if (target.status !== "admitted" || (target.host && !target.cohost)) return;
    await store.set(peerKey(code, target.id), { ...target, host: input.on, cohost: input.on });
    await notify(code, [...others.map((p) => p.id), target.id], "role", { id: target.id, host: input.on, cohost: input.on }, now);
    // A new co-host needs to see who is waiting.
    if (input.on) await notify(code, [target.id], "waiting-list", (await peers(code)).filter((p) => p.status === "waiting" && live(p, now)).map(pubForHost), now);
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

export type RoomPatch = {
  title?: string;
  agenda?: string;
  scheduledFor?: number | null;
  duration?: number | null;
  waitingRoom?: boolean;
  locked?: boolean;
  controls?: Partial<Controls>;
  passcode?: string | null;
  requireSignIn?: boolean;
  registration?: Registration | null;
};

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
    controls: { ...meta.controls, ...patch.controls },
    passcode: patch.passcode !== undefined ? patch.passcode || null : meta.passcode,
    requireSignIn: patch.requireSignIn ?? meta.requireSignIn,
    registration: patch.registration !== undefined ? patch.registration : meta.registration,
  };
  await kv().set(metaKey(code), next);
  if (JSON.stringify(settingsOf(next)) !== JSON.stringify(settingsOf(meta))) {
    const everyone = await inMeeting(code, now);
    await notify(code, everyone.map((p) => p.id), "settings", settingsOf(next), now);
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
  const out = (p: Peer) => ({ id: p.id, name: p.name, host: p.host, email: p.email ?? null, phone: p.phone ?? null, joined_at: new Date(p.joinedAt).toISOString() });
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
      return { id: a.id, name: a.name, host: a.host, email: a.email ?? null, phone: a.phone ?? null, joined_at: new Date(a.joinedAt).toISOString(), left_at: leftAt ? new Date(leftAt).toISOString() : null, duration: Math.round(((leftAt ?? now) - a.joinedAt) / 1000), reason: a.reason };
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

// ---- registration ----------------------------------------------------------------------------
// People register with their name, email and phone; each gets a personal join token ("<id>.<secret>",
// only its hash is stored). With manual approval, the host approves or declines them first.

const registrantJson = (r: Registrant) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  phone: r.phone || null,
  status: r.status,
  registered_at: new Date(r.createdAt).toISOString(),
});

async function registrantByToken(code: string, t: unknown) {
  if (typeof t !== "string") return null;
  const [id, secret] = t.split(".");
  if (!id || !secret || !/^[0-9a-f]{16}$/.test(id)) return null;
  const r = await kv().get<Registrant>(registrantKey(code, id));
  return r && sameHash(hash(secret), r.tokenHash) ? r : null;
}

export async function register(code: string, input: { name?: unknown; email?: unknown; phone?: unknown }, userId: string | null = null, now = Date.now(), byHost = false) {
  const meta = await getRoom(code);
  if (!meta.registration?.enabled) throw new RoomError(400, "This meeting doesn't take registrations.");
  if (meta.endedAt) throw new RoomError(410, "This meeting has ended.");
  const name = clean(input.name, MAX_NAME);
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase().slice(0, 200) : "";
  const phone = typeof input.phone === "string" ? input.phone.replace(/[^\d+()\- ]/g, "").trim().slice(0, 30) : "";
  if (!name) throw new RoomError(400, "Enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RoomError(400, "Enter a valid email address.");
  if (meta.registration.requirePhone && phone.replace(/\D/g, "").length < 6) throw new RoomError(400, "Enter your phone number.");
  const store = kv();
  // Registering again with the same email re-issues the link rather than adding a duplicate.
  const all = await registrantsOf(code);
  const prev = all.find((r) => r.email === email);
  const secret = token();
  const r: Registrant = {
    id: prev?.id ?? randomBytes(8).toString("hex"),
    name,
    email,
    phone,
    status: prev?.status ?? (byHost || meta.registration.approval === "auto" ? "approved" : "pending"),
    createdAt: prev?.createdAt ?? now,
    tokenHash: hash(secret),
    userId: userId ?? prev?.userId ?? null,
  };
  await store.set(registrantKey(code, r.id), r);
  if (!prev) {
    const hosts = (await inMeeting(code, now)).filter((p) => p.host);
    await notify(code, hosts.map((p) => p.id), "registered", { name, status: r.status }, now);
    tell(meta, "meeting.registration_created", { registrant: registrantJson(r) }, now);
  }
  const origin = meta.origin ?? process.env.URL ?? "";
  const joinToken = `${r.id}.${secret}`;
  return { ...registrantJson(r), join_url: `${origin}/m/${code}?r=${joinToken}${meta.passcode ? `&pwd=${encodeURIComponent(meta.passcode)}` : ""}`, token: joinToken };
}

/** A registrant checking on their own registration with their token. */
export async function registrationStatus(code: string, t: unknown) {
  const r = await registrantByToken(code, t);
  if (!r) throw new RoomError(404, "Registration not found.");
  return registrantJson(r);
}

async function registrantsOf(code: string) {
  const store = kv();
  const keys = await store.list(`rooms/${code}/registrants/`);
  return (await Promise.all(keys.map((k) => store.get<Registrant>(k)))).filter((r): r is Registrant => r !== null).sort((a, b) => a.createdAt - b.createdAt);
}

export async function listRegistrants(userId: string, code: string) {
  await ownRoom(userId, code);
  return (await registrantsOf(code)).map((r) => registrantJson(r));
}

export async function setRegistrant(userId: string, code: string, id: string, status: unknown, now = Date.now()) {
  const meta = await ownRoom(userId, code);
  if (status !== "approved" && status !== "denied") throw new RoomError(400, "status must be approved or denied.");
  const r = /^[0-9a-f]{16}$/.test(id) ? await kv().get<Registrant>(registrantKey(code, id)) : null;
  if (!r) throw new RoomError(404, "Registrant not found.");
  const next = { ...r, status: status as Registrant["status"] };
  await kv().set(registrantKey(code, id), next);
  tell(meta, status === "approved" ? "meeting.registration_approved" : "meeting.registration_denied", { registrant: registrantJson(next) }, now);
  return registrantJson(next);
}
