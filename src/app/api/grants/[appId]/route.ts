import { handle, sameOrigin } from "@/lib/http";
import { revokeGrant } from "@/lib/oauth";
import { requireUser } from "@/lib/session";

/** Removes an app's access: its tokens stop working and it stops receiving this account's events. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/grants/[appId]">) {
  const { appId } = await ctx.params;
  return handle(async () => {
    sameOrigin(req);
    await revokeGrant((await requireUser()).id, appId);
  });
}
