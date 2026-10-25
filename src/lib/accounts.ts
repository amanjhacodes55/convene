import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { RoomError } from "./errors";
import { kv } from "./store";

// Accounts are optional: anyone can start or join a meeting without one. An account adds a meetings
// dashboard with scheduling and reports, meetings that recognise you as host on any device, and the
// developer platform (apps, OAuth, the REST API and webhooks).
//
// Keys:
//   users/<id>                 the account
//   emails/<email>             { id }, so an email maps to one account
//   sessions/<sha256(token)>   a signed-in browser

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export type User = { id: string; email: string; name: string; passwordHash: string; createdAt: number };
export type PublicUser = { id: string; email: string; name: string; createdAt: number };

export const SESSION_COOKIE = "convene_session";
export const SESSION_DAYS = 30;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const userKey = (id: string) => `users/${id}`;
const emailKey = (email: string) => `emails/${email}`;
const sessionKey = (token: string) => `sessions/${sha256(token)}`;

export const publicUser = (u: User): PublicUser => ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt });

async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${(await scrypt(pw, salt, 32)).toString("base64")}`;
}

async function checkPassword(pw: string, stored: string) {
  const [, salt, want] = stored.split("$");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), 32);
  return timingSafeEqual(got, Buffer.from(want, "base64"));
}

const normEmail = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "");
const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 200;

async function newSession(userId: string, now: number) {
  const token = randomBytes(32).toString("base64url");
  await kv().set(sessionKey(token), { userId, expiresAt: now + SESSION_DAYS * 86_400_000 });
  return token;
}

export async function signUp(input: { email?: unknown; name?: unknown; password?: unknown }, now = Date.now()) {
  const email = normEmail(input.email);
  const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!validEmail(email)) throw new RoomError(400, "Enter a valid email address.");
  if (!name) throw new RoomError(400, "Enter your name.");
  if (password.length < 8) throw new RoomError(400, "Use a password of at least 8 characters.");
  if (await kv().get(emailKey(email))) throw new RoomError(409, "An account with this email already exists. Sign in instead.");
  const user: User = { id: randomBytes(8).toString("hex"), email, name, passwordHash: await hashPassword(password), createdAt: now };
  await kv().set(userKey(user.id), user);
  await kv().set(emailKey(email), { id: user.id });
  return { user: publicUser(user), token: await newSession(user.id, now) };
}

export async function signIn(input: { email?: unknown; password?: unknown }, now = Date.now()) {
  const email = normEmail(input.email);
  const password = typeof input.password === "string" ? input.password : "";
  const ref = email ? await kv().get<{ id: string }>(emailKey(email)) : null;
  const user = ref ? await kv().get<User>(userKey(ref.id)) : null;
  // Same answer for an unknown email and a wrong password, so accounts can't be probed.
  if (!user || !(await checkPassword(password, user.passwordHash))) throw new RoomError(401, "That email and password don't match.");
  return { user: publicUser(user), token: await newSession(user.id, now) };
}

export async function sessionUser(token: string | undefined, now = Date.now()): Promise<User | null> {
  if (!token) return null;
  const s = await kv().get<{ userId: string; expiresAt: number }>(sessionKey(token));
  if (!s || s.expiresAt < now) return null;
  return kv().get<User>(userKey(s.userId));
}

export async function signOut(token: string | undefined) {
  if (token) await kv().delete(sessionKey(token));
}

export const getUser = (id: string) => kv().get<User>(userKey(id));

export async function updateProfile(user: User, input: { name?: unknown }) {
  const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  if (!name) throw new RoomError(400, "Enter your name.");
  const next = { ...user, name };
  await kv().set(userKey(user.id), next);
  return publicUser(next);
}
