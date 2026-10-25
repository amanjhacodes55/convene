import { signUp } from "@/lib/accounts";
import { body, handle, sameOrigin } from "@/lib/http";
import { setSession } from "@/lib/session";

export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const { user, token } = await signUp(await body(req));
    await setSession(token);
    return { user };
  });
}
