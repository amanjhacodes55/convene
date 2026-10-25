import { handle } from "@/lib/http";
import { listGrants } from "@/lib/oauth";
import { requireUser } from "@/lib/session";

/** Apps this account has authorized. */
export async function GET() {
  return handle(async () => ({ grants: await listGrants((await requireUser()).id) }));
}
