import { RoomError } from "./rooms";

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
