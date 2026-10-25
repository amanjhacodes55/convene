import { body, handle } from "@/lib/http";
import { register, registrationStatus } from "@/lib/rooms";
import { currentUser } from "@/lib/session";

/** Registers for a meeting that requires it. The response holds the personal join link. */
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/register">) {
  const { code } = await ctx.params;
  return handle(async () => register(code, await body(req), (await currentUser())?.id ?? null));
}

/** A registrant checking whether the host has approved them yet (?token=). */
export async function GET(req: Request, ctx: RouteContext<"/api/rooms/[code]/register">) {
  const { code } = await ctx.params;
  return handle(() => registrationStatus(code, new URL(req.url).searchParams.get("token")));
}
