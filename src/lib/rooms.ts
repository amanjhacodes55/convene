import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isCode } from "./codes";
import { kv } from "./store";

// Meetings are coordinated through the store; audio and video never touch the server. Each
// participant ("peer") polls an inbox that holds signalling messages from other peers (WebRTC
// offers, answers and ICE candidates) and room events from the server (joins, leaves, admissions).
//
// Keys:
//   rooms/<code>/meta                       the room
//   rooms/<code>/peers/<id>                 one participant
//   rooms/<code>/inbox/<to>/<from>-<seq>    one message from a peer; per-sender order comes from <seq>
//   rooms/<code>/inbox/<to>/!<time>         one message from the server

export type RoomMeta = {
  code: string;
  title: string;
  createdAt: number;
  hostKeyHash: string;
  locked: boolean;
  waitingRoom: boolean;
  endedAt: number | null;
};

export type PeerStatus = "waiting" | "admitted" | "denied" | "removed";

type Peer = { id: string; name: string; joinedAt: number; lastSeen: number; status: PeerStatus; host: boolean; tokenHash: string };

export type PublicPeer = { id: string; name: string; joinedAt: number; host: boolean };

export type Message = { id: string; from: string; type: string; data?: unknown };

export type Settings = { locked: boolean; waitingRoom: boolean };

export class RoomError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A peer that has not polled for this long is treated as gone. */
export const STALE_MS = 35_000;
const HEARTBEAT_MS = 10_000;
const MAX_NAME = 40;
const MAX_TITLE = 80;
export const MAX_SIGNAL_BYTES = 64_000;

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(24).toString("base64url");
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
const pub = (p: Peer): PublicPeer => ({ id: p.id, name: p.name, joinedAt: p.joinedAt, host: p.host });

const metaKey = (code: string) => `rooms/${code}/meta`;
const peerKey = (code: string, id: string) => `rooms/${code}/peers/${id}`;
const inboxPrefix = (code: string, to: string) => `rooms/${code}/inbox/${to}/`;

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

export async function createRoom(input: { title?: string; waitingRoom?: boolean }, now = Date.now()) {
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
  };
  await kv().set(metaKey(code), meta);
  return { code, hostKey, title: meta.title };
}

export async function getRoom(code: string): Promise<RoomMeta> {
  const meta = isCode(code) ? await kv().get<RoomMeta>(metaKey(code)) : null;
  if (!meta) throw new RoomError(404, "This meeting doesn't exist. Check the code or link.");
  return meta;
}

export async function roomInfo(code: string) {
  const meta = await getRoom(code);
  return { code, title: meta.title, locked: meta.locked, waitingRoom: meta.waitingRoom, ended: meta.endedAt !== null };
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

export async function join(code: string, input: { name?: unknown; hostKey?: unknown }, now = Date.now()) {
  const meta = await getRoom(code);
  if (meta.endedAt) throw new RoomError(410, "This meeting has ended.");
  const name = clean(input.name, MAX_NAME);
  if (!name) throw new RoomError(400, "Enter your name to join.");
  const host = typeof input.hostKey === "string" && sameHash(hash(input.hostKey), meta.hostKeyHash);
  if (meta.locked && !host) throw new RoomError(423, "The host has locked this meeting.");

  const others = await inMeeting(code, now);
  const hostHere = others.some((p) => p.host);
  // With nobody to let them in, guests are admitted directly rather than waiting forever.
  const status: PeerStatus = meta.waitingRoom && !host && hostHere ? "waiting" : "admitted";
  const secret = token();
  const peer: Peer = { id: randomBytes(8).toString("hex"), name, joinedAt: now, lastSeen: now, status, host, tokenHash: hash(secret) };
  await kv().set(peerKey(code, peer.id), peer);

  if (status === "admitted") await notify(code, others.map((p) => p.id), "peer-joined", pub(peer), now);
  else await notify(code, others.filter((p) => p.host).map((p) => p.id), "knock", pub(peer), now);

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
  if (peer.status === "admitted") await notify(code, others.map((p) => p.id), "peer-left", { id: peer.id }, now);
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

  if (input.action === "settings") {
    const next = { ...meta, locked: input.locked ?? meta.locked, waitingRoom: input.waitingRoom ?? meta.waitingRoom };
    await store.set(metaKey(code), next);
    const everyone = await inMeeting(code, now);
    await notify(code, everyone.map((p) => p.id), "settings", { locked: next.locked, waitingRoom: next.waitingRoom }, now);
    return;
  }

  if (input.action === "end") {
    await store.set(metaKey(code), { ...meta, endedAt: now });
    const everyone = (await peers(code)).filter((p) => live(p, now) && p.id !== host.id);
    await notify(code, everyone.map((p) => p.id), "ended", null, now);
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
  } else if (input.action === "deny") {
    if (target.status !== "waiting") return;
    await store.set(peerKey(code, target.id), { ...target, status: "denied" });
    await notify(code, [target.id], "denied", null, now);
    await notify(code, otherHosts, "knock-cancelled", { id: target.id }, now);
  } else {
    await store.set(peerKey(code, target.id), { ...target, status: "removed" });
    await notify(code, [target.id], "removed", null, now);
    await notify(code, others.map((p) => p.id), "peer-left", { id: target.id }, now);
  }
}
