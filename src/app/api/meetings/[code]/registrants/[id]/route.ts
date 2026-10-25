import { body, handle, sameOrigin } from "@/lib/http";
import { setRegistrant } from "@/lib/rooms";
import { requireUser } from "@/lib/session";

/** Approve or decline a registration: { status: "approved" | "denied" }. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/meetings/[code]/registrants/[id]">) {
  const { code, id } = await ctx.params;
  return handle(async () => {
    sameOrigin(req);
    return { registrant: await setRegistrant((await requireUser()).id, code, id, (await body(req)).status) };
  });
}
