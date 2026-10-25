import { RoomError } from "@/lib/errors";
import { body, handle, sameOrigin } from "@/lib/http";
import { approve, checkAuthorize, SCOPES, withParams, type AuthorizeParams } from "@/lib/oauth";
import { currentUser, requireUser } from "@/lib/session";

const params = (src: { get(k: string): string | null } | Record<string, unknown>): AuthorizeParams => {
  const get = (k: string) => ("get" in src && typeof src.get === "function" ? (src.get as (k: string) => string | null)(k) : typeof (src as Record<string, unknown>)[k] === "string" ? ((src as Record<string, unknown>)[k] as string) : null);
  return {
    response_type: get("response_type"),
    client_id: get("client_id"),
    redirect_uri: get("redirect_uri"),
    scope: get("scope"),
    state: get("state"),
    code_challenge: get("code_challenge"),
    code_challenge_method: get("code_challenge_method"),
  };
};

/** What the consent screen shows: the app, the scopes it asks for, and who is signed in. */
export async function GET(req: Request) {
  return handle(async () => {
    const p = params(new URL(req.url).searchParams);
    const c = await checkAuthorize(p);
    const user = await currentUser();
    // Errors the app should hear about go straight back to its redirect URI.
    if (c.error) return { redirect: withParams(c.redirectUri, { error: c.error, state: p.state }) };
    return {
      app: { name: c.app.name, description: c.app.description, createdAt: c.app.createdAt },
      scopes: c.scopes!.map((s) => ({ scope: s, text: SCOPES[s] })),
      redirectHost: new URL(c.redirectUri).host,
      user: user ? { name: user.name, email: user.email } : null,
    };
  });
}

/** Allow or Cancel on the consent screen; answers with where to send the browser. */
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const b = await body(req);
    const p = params(b);
    const user = await requireUser();
    if (b.decision === "deny") {
      const c = await checkAuthorize(p);
      return { redirect: withParams(c.redirectUri, { error: "access_denied", state: p.state }) };
    }
    if (b.decision !== "allow") throw new RoomError(400, "decision must be allow or deny.");
    return { redirect: await approve(user.id, p) };
  });
}
