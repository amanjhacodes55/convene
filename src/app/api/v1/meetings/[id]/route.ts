import { meetingInput, preflight, v1 } from "@/lib/api";
import { body } from "@/lib/http";
import { deleteRoom, meetingJson, ownRoom, updateRoom } from "@/lib/rooms";

export const OPTIONS = preflight;

export async function GET(req: Request, ctx: RouteContext<"/api/v1/meetings/[id]">) {
  const { id } = await ctx.params;
  return v1(req, "meeting:read", async ({ userId }) => meetingJson(await ownRoom(userId, id)));
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/v1/meetings/[id]">) {
  const { id } = await ctx.params;
  return v1(req, "meeting:write", async ({ userId }) => meetingJson(await updateRoom(userId, id, meetingInput(await body(req), true))));
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/v1/meetings/[id]">) {
  const { id } = await ctx.params;
  return v1(req, "meeting:write", async ({ userId }) => {
    await deleteRoom(userId, id);
  });
}
