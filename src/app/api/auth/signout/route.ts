import { signOut } from "@/lib/accounts";
import { handle, sameOrigin } from "@/lib/http";
import { clearSession } from "@/lib/session";

export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    await signOut(await clearSession());
  });
}
