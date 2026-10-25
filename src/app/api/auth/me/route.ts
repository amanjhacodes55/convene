import { publicUser, updateProfile } from "@/lib/accounts";
import { body, handle, sameOrigin } from "@/lib/http";
import { currentUser, requireUser } from "@/lib/session";

/** The signed-in account, or { user: null }: pages use this to choose what to show. */
export async function GET() {
  return handle(async () => {
    const user = await currentUser();
    return { user: user ? publicUser(user) : null };
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    return { user: await updateProfile(await requireUser(), await body(req)) };
  });
}
