import { body, handle, originOf, sameOrigin } from "@/lib/http";
import { deleteApp, ownApp, toPublic, updateApp } from "@/lib/oauth";
import { requireUser } from "@/lib/session";

export async function GET(_req: Request, ctx: RouteContext<"/api/apps/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => ({ app: toPublic(await ownApp((await requireUser()).id, id)) }));
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/apps/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => {
    sameOrigin(req);
    return { app: await updateApp((await requireUser()).id, id, await body(req), Date.now(), originOf(req)) };
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/apps/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => {
    sameOrigin(req);
    await deleteApp((await requireUser()).id, id);
  });
}
