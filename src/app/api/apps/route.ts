import { body, handle, sameOrigin } from "@/lib/http";
import { createApp, listApps, toPublic } from "@/lib/oauth";
import { requireUser } from "@/lib/session";

export async function GET() {
  return handle(async () => ({ apps: (await listApps((await requireUser()).id)).map(toPublic) }));
}

/** Creates an app. The client secret is in this response and never again. */
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    return createApp((await requireUser()).id, await body(req));
  });
}
