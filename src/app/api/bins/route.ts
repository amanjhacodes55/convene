import { handle, sameOrigin } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { createBin } from "@/lib/webhooks";

/** A new test inbox: a URL that records what is posted to it, for trying webhooks. */
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    return createBin((await requireUser()).id);
  });
}
