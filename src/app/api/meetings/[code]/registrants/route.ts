import { body, handle, sameOrigin } from "@/lib/http";
import { listRegistrants, ownRoom, register } from "@/lib/rooms";
import { requireUser } from "@/lib/session";

export async function GET(_req: Request, ctx: RouteContext<"/api/meetings/[code]/registrants">) {
  const { code } = await ctx.params;
  return handle(async () => ({ registrants: await listRegistrants((await requireUser()).id, code) }));
}

/** The host adds someone; they are approved at once. */
export async function POST(req: Request, ctx: RouteContext<"/api/meetings/[code]/registrants">) {
  const { code } = await ctx.params;
  return handle(async () => {
    sameOrigin(req);
    const user = await requireUser();
    await ownRoom(user.id, code);
    return register(code, await body(req), null, Date.now(), true);
  });
}
