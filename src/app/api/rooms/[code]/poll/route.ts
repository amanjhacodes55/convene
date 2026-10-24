import { body, handle } from "@/lib/http";
import { authenticate, poll } from "@/lib/rooms";

/** A participant's inbox. POST so the acknowledgements of the previous batch ride along. */
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/poll">) {
  const { code } = await ctx.params;
  return handle(async () => {
    const b = await body(req);
    const peer = await authenticate(code, b.peerId, b.token);
    return poll(code, peer, b.ack);
  });
}
