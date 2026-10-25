import { preflight, v1 } from "@/lib/api";
import { body } from "@/lib/http";
import { ownRoom, postAppMessage } from "@/lib/rooms";

export const OPTIONS = preflight;

/** Posts a message into a live meeting's chat, shown with the app's name. */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/meetings/[id]/messages">) {
  const { id } = await ctx.params;
  return v1(
    req,
    "chat:write",
    async ({ userId, app }) => {
      await ownRoom(userId, id);
      return postAppMessage(id, app, (await body(req)).text);
    },
    201,
  );
}
