import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionUser, signIn, signUp } from "@/lib/accounts";
import { meetingInput } from "@/lib/api";
import { approve, bearer, checkAuthorize, createApp, deleteApp, revokeGrant, token, updateApp } from "@/lib/oauth";
import { attendance, authenticate, createRoom, hostAction, join, leave, listRooms, liveParticipants, poll, postAppMessage } from "@/lib/rooms";
import { memoryStore, setStoreForTests } from "@/lib/store";
import { createBin, readBin, sign, verify } from "@/lib/webhooks";

const T = 1_800_000_000_000;
const REDIRECT = "https://app.example.com/callback";

beforeEach(() => setStoreForTests(memoryStore()));
afterEach(() => vi.unstubAllGlobals());

async function developer() {
  const { user } = await signUp({ email: "Dev@Example.com", name: "Dana Dev", password: "correct horse" });
  return user;
}

describe("accounts", () => {
  it("signs up, signs in and checks passwords", async () => {
    const { token: t } = await signUp({ email: "maya@acme.dev", name: "Maya", password: "hunter2hunter2" });
    expect((await sessionUser(t))?.email).toBe("maya@acme.dev");
    await expect(signUp({ email: "MAYA@acme.dev", name: "M", password: "another-pass" })).rejects.toMatchObject({ status: 409 });
    await expect(signIn({ email: "maya@acme.dev", password: "wrong-password" })).rejects.toMatchObject({ status: 401 });
    await expect(signIn({ email: "nobody@acme.dev", password: "wrong-password" })).rejects.toMatchObject({ status: 401 });
    expect((await signIn({ email: " Maya@ACME.dev ", password: "hunter2hunter2" })).user.name).toBe("Maya");
    await expect(signUp({ email: "x@y.z", name: "X", password: "short" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("oauth", () => {
  it("runs the authorization-code flow with PKCE and rotating refresh tokens", async () => {
    const dev = await developer();
    const { app, clientSecret } = await createApp(dev.id, { name: "Notes bot", redirectUris: [REDIRECT], scopes: ["meeting:read", "meeting:write", "user:read"] });
    const { user } = await signUp({ email: "leo@acme.dev", name: "Leo", password: "password123" });

    const verifier = "a".repeat(50);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const params = { response_type: "code", client_id: app.clientId, redirect_uri: REDIRECT, scope: "meeting:read user:read", state: "xyz", code_challenge: challenge, code_challenge_method: "S256" };
    const redirect = new URL(await approve(user.id, params, T));
    expect(redirect.origin + redirect.pathname).toBe(REDIRECT);
    expect(redirect.searchParams.get("state")).toBe("xyz");
    const code = redirect.searchParams.get("code")!;

    const basic = { id: app.clientId, secret: clientSecret };
    await expect(token({ grant_type: "authorization_code", code, code_verifier: "wrong" }, basic, T)).rejects.toMatchObject({ code: "invalid_grant" });
    // Codes are single use, even after a failed exchange.
    await expect(token({ grant_type: "authorization_code", code, code_verifier: verifier }, basic, T)).rejects.toMatchObject({ code: "invalid_grant" });

    const code2 = new URL(await approve(user.id, params, T)).searchParams.get("code")!;
    const tok = await token({ grant_type: "authorization_code", code: code2, code_verifier: verifier, redirect_uri: REDIRECT }, basic, T);
    expect(tok).toMatchObject({ token_type: "bearer", scope: "meeting:read user:read" });
    expect(await bearer(`Bearer ${tok.access_token}`, T)).toMatchObject({ userId: user.id, scopes: ["meeting:read", "user:read"] });

    const next = await token({ grant_type: "refresh_token", refresh_token: tok.refresh_token as string }, basic, T);
    await expect(token({ grant_type: "refresh_token", refresh_token: tok.refresh_token as string }, basic, T)).rejects.toMatchObject({ code: "invalid_grant" });

    // Revoking the app's access kills every token issued under it.
    await revokeGrant(user.id, app.id);
    await expect(bearer(`Bearer ${next.access_token}`, T)).rejects.toMatchObject({ status: 401 });
    await expect(token({ grant_type: "refresh_token", refresh_token: next.refresh_token as string }, basic, T)).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("refuses bad clients, unregistered redirects and scopes beyond the app's", async () => {
    const dev = await developer();
    const { app } = await createApp(dev.id, { name: "A", redirectUris: [REDIRECT], scopes: ["meeting:read"] });
    await expect(checkAuthorize({ client_id: "nope", redirect_uri: REDIRECT, response_type: "code" })).rejects.toMatchObject({ code: "invalid_client" });
    await expect(checkAuthorize({ client_id: app.clientId, redirect_uri: "https://evil.example/cb", response_type: "code" })).rejects.toMatchObject({ code: "invalid_redirect_uri" });
    expect((await checkAuthorize({ client_id: app.clientId, redirect_uri: REDIRECT, response_type: "code", scope: "meeting:write" })).error).toBe("invalid_scope");
    await expect(token({ grant_type: "client_credentials" }, { id: app.clientId, secret: "wrong" })).rejects.toMatchObject({ code: "invalid_client" });
    await expect(createApp(dev.id, { name: "B", redirectUris: ["http://example.com/cb"] })).rejects.toMatchObject({ status: 400 });
  });

  it("gives server-to-server apps client_credentials tokens for their developer", async () => {
    const dev = await developer();
    const { app, clientSecret } = await createApp(dev.id, { name: "Sync", type: "server", scopes: ["meeting:write"] });
    const tok = await token({ grant_type: "client_credentials", client_id: app.clientId, client_secret: clientSecret }, null, T);
    expect(tok.refresh_token).toBeUndefined();
    expect(await bearer(`Bearer ${tok.access_token}`, T)).toMatchObject({ userId: dev.id, scopes: ["meeting:write"] });
    await expect(bearer(`Bearer ${tok.access_token}`, T + 3601_000)).rejects.toMatchObject({ status: 401 });
    await deleteApp(dev.id, app.id);
    await expect(bearer(`Bearer ${tok.access_token}`, T)).rejects.toMatchObject({ status: 401 });
  });
});

describe("meetings with owners", () => {
  it("makes the signed-in owner host, and keeps an attendance report", async () => {
    const dev = await developer();
    const { code } = await createRoom({ title: "Standup", ownerId: dev.id, scheduledFor: T + 3600_000, duration: 15 });
    expect((await listRooms(dev.id)).map((m) => m.code)).toEqual([code]);
    const host = await join(code, { name: "Dana", userId: dev.id }, T);
    expect(host.peer.host).toBe(true);
    const guest = await join(code, { name: "Leo" }, T + 1000);
    expect(guest.peer.host).toBe(false);
    expect((await liveParticipants(code, T + 2000)).participants.map((p) => p.name)).toEqual(["Dana", "Leo"]);
    await leave(code, await authenticate(code, guest.peer.id, guest.token), T + 61_000);
    await hostAction(code, await authenticate(code, host.peer.id, host.token), { action: "end" }, T + 120_000);
    const report = await attendance(code, T + 130_000);
    expect(report.map((r) => [r.name, r.duration, r.reason])).toEqual([
      ["Dana", 120, "ended"],
      ["Leo", 60, "left"],
    ]);
  });

  it("delivers app messages to everyone in the meeting", async () => {
    const { code } = await createRoom({});
    await expect(postAppMessage(code, { id: "a", name: "Bot" }, "hi", T)).rejects.toMatchObject({ status: 409 });
    const p = await join(code, { name: "Maya" }, T);
    await postAppMessage(code, { id: "a", name: "Bot" }, "Agenda posted", T);
    const { messages } = await poll(code, await authenticate(code, p.peer.id, p.token), undefined, T);
    expect(messages).toMatchObject([{ type: "app-message", data: { app: "Bot", text: "Agenda posted" } }]);
  });

  it("reads API meeting input", () => {
    expect(meetingInput({ topic: "Sync", start_time: "2026-11-02T15:00:00Z", duration: 30, settings: { waiting_room: true } })).toEqual({
      title: "Sync",
      scheduledFor: Date.parse("2026-11-02T15:00:00Z"),
      duration: 30,
      waitingRoom: true,
    });
    expect(() => meetingInput({ start_time: "next tuesday" })).toThrow(/ISO 8601/);
    expect(() => meetingInput({ duration: 0 })).toThrow(/minutes/);
  });
});

describe("webhooks", () => {
  it("signs and verifies payloads", () => {
    const body = '{"event":"meeting.started"}';
    const header = sign("whsec_x", body, T / 1000);
    expect(verify("whsec_x", body, header, T)).toBe(true);
    expect(verify("whsec_y", body, header, T)).toBe(false);
    expect(verify("whsec_x", body + " ", header, T)).toBe(false);
    expect(verify("whsec_x", body, header, T + 10 * 60_000)).toBe(false);
  });

  it("sends subscribed events about an owner's meetings, signed with the app's secret", async () => {
    const sent: { url: string; headers: Record<string, string>; body: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      sent.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
      return new Response("ok");
    });
    const dev = await developer();
    const { app } = await createApp(dev.id, { name: "Hooks", type: "server", scopes: ["meeting:read", "participant:read"] });
    const updated = await updateApp(dev.id, app.id, { webhook: { url: "https://hooks.example.com/convene", events: ["meeting.started", "participant.joined"] } });
    const { code } = await createRoom({ title: "Review", ownerId: dev.id, origin: "https://meet.example" });
    await join(code, { name: "Maya" }, T);
    await vi.waitFor(() => expect(sent.length).toBe(2));
    const events = sent.map((s) => JSON.parse(s.body));
    expect(events.map((e) => e.event).sort()).toEqual(["meeting.started", "participant.joined"]);
    expect(events[0].payload.meeting).toMatchObject({ id: code, topic: "Review", join_url: `https://meet.example/m/${code}` });
    for (const s of sent) expect(verify(updated.webhook!.secret, s.body, s.headers["Convene-Signature"])).toBe(true);
  });

  it("keeps test inboxes private to their owner", async () => {
    const dev = await developer();
    const { id } = await createBin(dev.id);
    expect(await readBin(dev.id, id)).toEqual([]);
    await expect(readBin("someone-else", id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("webhook endpoints", () => {
  it("refuse private addresses in production, except the built-in inbox", async () => {
    const dev = await developer();
    const { app } = await createApp(dev.id, { name: "H", type: "server" });
    vi.stubEnv("NODE_ENV", "production");
    try {
      for (const url of ["http://10.0.0.5/hook", "https://192.168.1.2/x", "https://169.254.169.254/latest", "https://[::1]/x", "https://localhost/x"]) {
        await expect(updateApp(dev.id, app.id, { webhook: { url, events: [] } })).rejects.toMatchObject({ status: 400 });
      }
      await expect(updateApp(dev.id, app.id, { webhook: { url: "https://hooks.example.com/x", events: [] } })).resolves.toBeTruthy();
      await expect(updateApp(dev.id, app.id, { webhook: { url: "http://localhost:3000/api/bins/0123456789abcdef0123", events: [] } })).resolves.toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
