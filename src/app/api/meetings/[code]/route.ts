import { meetingInput } from "@/lib/api";
import { body, handle, sameOrigin } from "@/lib/http";
import { attendance, deleteRoom, liveParticipants, meetingJson, ownRoom, updateRoom } from "@/lib/rooms";
import { requireUser } from "@/lib/session";

/** One of the account's meetings, with who is in it now and the attendance report. */
export async function GET(_req: Request, ctx: RouteContext<"/api/meetings/[code]">) {
  const { code } = await ctx.params;
  return handle(async () => {
    const user = await requireUser();
    const meta = await ownRoom(user.id, code);
    return { meeting: meetingJson(meta), ...(await liveParticipants(code)), report: await attendance(code) };
  });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/meetings/[code]">) {
  const { code } = await ctx.params;
  return handle(async () => {
    sameOrigin(req);
    const user = await requireUser();
    return { meeting: meetingJson(await updateRoom(user.id, code, meetingInput(await body(req), true))) };
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/meetings/[code]">) {
  const { code } = await ctx.params;
  return handle(async () => {
    sameOrigin(req);
    await deleteRoom((await requireUser()).id, code);
  });
}
