import { RoomError } from "@/lib/errors";
import { body, handle, originOf, sameOrigin } from "@/lib/http";
import { rotateSecret, rotateWebhookSecret, testToken } from "@/lib/oauth";
import { requireUser } from "@/lib/session";
import { listDeliveries, redeliver, sendTest } from "@/lib/webhooks";

/** GET /api/apps/<id>/deliveries: the webhook delivery log, newest first. */
export async function GET(_req: Request, ctx: RouteContext<"/api/apps/[id]/[action]">) {
  const { id, action } = await ctx.params;
  return handle(async () => {
    if (action !== "deliveries") throw new RoomError(404, "Not found.");
    return { deliveries: await listDeliveries((await requireUser()).id, id) };
  });
}

/** The app page's buttons: rotate secrets, send a test event, redeliver, and mint a test token. */
export async function POST(req: Request, ctx: RouteContext<"/api/apps/[id]/[action]">) {
  const { id, action } = await ctx.params;
  return handle(async () => {
    sameOrigin(req);
    const user = await requireUser();
    switch (action) {
      case "rotate-secret":
        return rotateSecret(user.id, id);
      case "rotate-webhook-secret":
        return { app: await rotateWebhookSecret(user.id, id) };
      case "test-webhook":
        return { delivery: await sendTest(user.id, id, originOf(req)) };
      case "redeliver":
        return { delivery: await redeliver(user.id, id, String((await body(req)).delivery)) };
      case "test-token":
        return testToken(user.id, id);
      default:
        throw new RoomError(404, "Not found.");
    }
  });
}
