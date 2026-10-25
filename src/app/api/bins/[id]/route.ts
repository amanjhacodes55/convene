import { handle } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { readBin, receive } from "@/lib/webhooks";

/** Anyone (a webhook sender) can post to an inbox; only its owner can read it. */
export async function POST(req: Request, ctx: RouteContext<"/api/bins/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => {
    await receive(id, req);
    return { received: true };
  });
}

export async function GET(_req: Request, ctx: RouteContext<"/api/bins/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => ({ requests: await readBin((await requireUser()).id, id) }));
}
