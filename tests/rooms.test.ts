import { beforeEach, describe, expect, it } from "vitest";
import { authenticate, createRoom, hostAction, isCode, join, leave, newCode, poll, roomInfo, signal, STALE_MS } from "@/lib/rooms";
import { memoryStore, setStoreForTests } from "@/lib/store";

const T = 1_800_000_000_000;

async function joined(code: string, name: string, hostKey?: string, now = T) {
  const r = await join(code, { name, hostKey }, now);
  return { ...r, me: await authenticate(code, r.peer.id, r.token) };
}
const inbox = async (code: string, p: Awaited<ReturnType<typeof joined>>, now = T) => poll(code, await authenticate(code, p.peer.id, p.token), undefined, now);

beforeEach(() => setStoreForTests(memoryStore()));

describe("codes", () => {
  it("are readable and validated", () => {
    for (let i = 0; i < 50; i++) expect(isCode(newCode())).toBe(true);
    expect(isCode("abc-defg-hij")).toBe(true);
    expect(isCode("../etc-passwd")).toBe(false);
  });
});

describe("joining", () => {
  it("tells existing participants and hands the newcomer the roster", async () => {
    const { code, hostKey } = await createRoom({ title: "  Weekly   sync " });
    expect((await roomInfo(code)).title).toBe("Weekly sync");
    const host = await joined(code, "Maya", hostKey);
    expect(host.peer.host).toBe(true);
    const guest = await joined(code, "Leo", undefined, T + 10);
    expect(guest.peer.host).toBe(false);
    expect(guest.peers.map((p) => p.name)).toEqual(["Maya"]);
    const { messages } = await inbox(code, host);
    expect(messages).toMatchObject([{ type: "peer-joined", data: { name: "Leo" } }]);
  });

  it("rejects unknown rooms, empty names and wrong host keys", async () => {
    await expect(join("abc-defg-hij", { name: "X" })).rejects.toMatchObject({ status: 404 });
    const { code } = await createRoom({});
    await expect(join(code, { name: "   " })).rejects.toMatchObject({ status: 400 });
    expect((await joined(code, "Eve", "not-the-key")).peer.host).toBe(false);
  });

  it("does not list participants who stopped polling", async () => {
    const { code } = await createRoom({});
    await joined(code, "Ghost", undefined, T);
    const late = await joined(code, "Late", undefined, T + STALE_MS + 1);
    expect(late.peers).toEqual([]);
  });
});

describe("signalling", () => {
  it("delivers in per-sender order and forgets acknowledged messages", async () => {
    const { code } = await createRoom({});
    const a = await joined(code, "A");
    const b = await joined(code, "B");
    await inbox(code, a); // the peer-joined notice
    await signal(code, b.me, a.peer.id, 2, { candidate: "c2" });
    await signal(code, b.me, a.peer.id, 1, { description: "offer" });
    const first = await inbox(code, a);
    const signals = first.messages.filter((m) => m.type === "signal");
    expect(signals.map((m) => m.data)).toEqual([{ description: "offer" }, { candidate: "c2" }]);
    const again = await poll(code, a.me, first.messages.map((m) => m.id), T);
    expect(again.messages).toEqual([]);
  });

  it("refuses bad tokens and oversized payloads", async () => {
    const { code } = await createRoom({});
    const a = await joined(code, "A");
    const b = await joined(code, "B");
    await expect(authenticate(code, a.peer.id, "wrong")).rejects.toMatchObject({ status: 401 });
    await expect(signal(code, b.me, a.peer.id, 1, "x".repeat(70_000))).rejects.toMatchObject({ status: 413 });
  });

  it("announces a departure to everyone else", async () => {
    const { code } = await createRoom({});
    const a = await joined(code, "A");
    const b = await joined(code, "B");
    await leave(code, b.me, T);
    expect((await inbox(code, a)).messages.at(-1)).toMatchObject({ type: "peer-left", data: { id: b.peer.id } });
    await expect(authenticate(code, b.peer.id, b.token)).rejects.toMatchObject({ status: 401 });
  });
});

describe("host controls", () => {
  it("holds guests in the waiting room until the host admits them", async () => {
    const { code, hostKey } = await createRoom({ waitingRoom: true });
    const host = await joined(code, "Host", hostKey);
    const guest = await joined(code, "Guest");
    expect(guest.status).toBe("waiting");
    expect(guest.peers).toEqual([]);
    await expect(signal(code, guest.me, host.peer.id, 1, {})).rejects.toMatchObject({ status: 403 });
    expect((await inbox(code, host)).messages).toMatchObject([{ type: "knock", data: { name: "Guest" } }]);

    await hostAction(code, host.me, { action: "admit", target: guest.peer.id });
    const g = await inbox(code, guest);
    expect(g.status).toBe("admitted");
    expect(g.messages).toMatchObject([{ type: "admitted", data: { peers: [{ name: "Host" }] } }]);
  });

  it("lets guests straight in when no host is there to admit them", async () => {
    const { code } = await createRoom({ waitingRoom: true });
    expect((await joined(code, "Early")).status).toBe("admitted");
  });

  it("locks, removes and ends; guests cannot", async () => {
    const { code, hostKey } = await createRoom({});
    const host = await joined(code, "Host", hostKey);
    const guest = await joined(code, "Guest");
    await expect(hostAction(code, guest.me, { action: "end" })).rejects.toMatchObject({ status: 403 });

    await hostAction(code, host.me, { action: "settings", locked: true });
    await expect(join(code, { name: "Late" })).rejects.toMatchObject({ status: 423 });
    expect((await joined(code, "Host again", hostKey)).peer.host).toBe(true);

    await hostAction(code, host.me, { action: "remove", target: guest.peer.id });
    const removed = await inbox(code, guest);
    expect(removed.status).toBe("removed");
    expect(removed.messages.map((m) => m.type)).toContain("removed");

    await hostAction(code, host.me, { action: "end" });
    expect((await roomInfo(code)).ended).toBe(true);
    await expect(join(code, { name: "After", hostKey })).rejects.toMatchObject({ status: 410 });
  });
});

describe("ordering", () => {
  it("reads a join notice before that newcomer's first offer", async () => {
    const { code } = await createRoom({});
    const a = await joined(code, "A");
    const b = await joined(code, "B");
    await signal(code, b.me, a.peer.id, 1, [{ description: "offer" }]);
    expect((await inbox(code, a)).messages.map((m) => m.type)).toEqual(["peer-joined", "signal"]);
  });
});
