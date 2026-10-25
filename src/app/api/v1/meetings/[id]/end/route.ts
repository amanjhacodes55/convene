import { preflight, v1 } from "@/lib/api";
import { endOwnRoom, getRoom, meetingJson } from "@/lib/rooms";

export const OPTIONS = preflight;

/** Ends a live meeting for everyone in it. */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/meetings/[id]/end">) {
  const { id } = await ctx.params;
  return v1(req, "meeting:write", async ({ userId }) => {
    await endOwnRoom(userId, id);
    return meetingJson(await getRoom(id));
  });
}
