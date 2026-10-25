import { preflight, v1 } from "@/lib/api";
import { attendance, meetingJson, ownRoom } from "@/lib/rooms";

export const OPTIONS = preflight;

/** The attendance report: everyone who joined, when, and for how long. */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/meetings/[id]/report">) {
  const { id } = await ctx.params;
  return v1(req, "meeting:read", async ({ userId }) => {
    const meta = await ownRoom(userId, id);
    const participants = await attendance(id);
    return { meeting: meetingJson(meta), total_records: participants.length, participants };
  });
}
