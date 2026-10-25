import { body, handle } from "@/lib/http";
import { authenticate, hostAction, join, leave, RoomError, roomInfo, signal, type HostAction } from "@/lib/rooms";
import { currentUser } from "@/lib/session";

export async function GET(_req: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  const { code } = await ctx.params;
  return handle(async () => roomInfo(code, (await currentUser())?.id));
}

/** Everything a participant does besides polling: join, signal, leave and host controls. */
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  const { code } = await ctx.params;
  return handle(async () => {
    const b = await body(req);
    // The meeting's owner, signed in, is its host on any device without the host key.
    if (b.action === "join") return join(code, { name: b.name, hostKey: b.hostKey, userId: (await currentUser())?.id });
    const peer = await authenticate(code, b.peerId, b.token);
    switch (b.action) {
      case "signal":
        return signal(code, peer, b.to, b.seq, b.data);
      case "leave":
        return leave(code, peer);
      case "admit":
      case "deny":
      case "remove":
        return hostAction(code, peer, { action: b.action, target: String(b.target) });
      case "settings":
        return hostAction(code, peer, {
          action: "settings",
          locked: typeof b.locked === "boolean" ? b.locked : undefined,
          waitingRoom: typeof b.waitingRoom === "boolean" ? b.waitingRoom : undefined,
        } satisfies HostAction);
      case "end":
        return hostAction(code, peer, { action: "end" });
      default:
        throw new RoomError(400, "Unknown action.");
    }
  });
}
