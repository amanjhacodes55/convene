import { preflight, v1 } from "@/lib/api";
import { body } from "@/lib/http";
import { listRegistrants, ownRoom, register } from "@/lib/rooms";

export const OPTIONS = preflight;

/** Everyone who registered, with their contact details and approval status. */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/meetings/[id]/registrants">) {
  const { id } = await ctx.params;
  return v1(req, "meeting:read", async ({ userId }) => {
    const registrants = await listRegistrants(userId, id);
    return { meeting_id: id, total_records: registrants.length, registrants };
  });
}

/** Registers someone (approved at once) and returns their personal join_url. */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/meetings/[id]/registrants">) {
  const { id } = await ctx.params;
  return v1(
    req,
    "meeting:write",
    async ({ userId }) => {
      await ownRoom(userId, id);
      const { token: _, ...r } = await register(id, await body(req), null, Date.now(), true); // eslint-disable-line @typescript-eslint/no-unused-vars
      return r;
    },
    201,
  );
}
