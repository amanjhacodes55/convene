import { RoomError } from "./errors";

/** Runs a handler, turning RoomErrors into JSON errors with their status and hiding anything else. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const result = await fn();
    return Response.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof RoomError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}

/** The JSON body, or an empty object when it is missing or malformed (sendBeacon posts text/plain). */
export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = JSON.parse(await req.text());
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/**
 * For endpoints that act on the signed-in account: refuse requests sent from other sites. The
 * session cookie is SameSite=Lax already; this also covers same-site subdomains and older browsers.
 */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))) {
    throw new RoomError(403, "Cross-site request refused.");
  }
}

/** The site's own address as the browser sees it, for links in responses. */
export function originOf(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}
