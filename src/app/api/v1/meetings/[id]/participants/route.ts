import { preflight, v1 } from "@/lib/api";
import { liveParticipants, ownRoom } from "@/lib/rooms";

export const OPTIONS = preflight;

/** Who is in the meeting and its waiting room right now. */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/meetings/[id]/participants">) {
  const { id } = await ctx.params;
  return v1(req, "participant:read", async ({ userId }) => {
    await ownRoom(userId, id);
    const live = await liveParticipants(id);
    return { meeting_id: id, total_records: live.participants.length, ...live };
  });
}
