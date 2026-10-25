import { preflight, v1 } from "@/lib/api";
import { body } from "@/lib/http";
import { setRegistrant } from "@/lib/rooms";

export const OPTIONS = preflight;

/** Approve or decline: { "status": "approved" | "denied" }. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/v1/meetings/[id]/registrants/[rid]">) {
  const { id, rid } = await ctx.params;
  return v1(req, "meeting:write", async ({ userId }) => setRegistrant(userId, id, rid, (await body(req)).status));
}
