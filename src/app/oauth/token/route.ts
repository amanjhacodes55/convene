import { RoomError } from "@/lib/errors";
import { token } from "@/lib/oauth";
import { basicAuth, readParams } from "@/lib/oauth-http";

// The OAuth 2.0 token endpoint (RFC 6749): form-encoded or JSON in, JSON out. Client credentials go
// in an HTTP Basic header or in the body as client_id and client_secret.

const HEADERS = { "Cache-Control": "no-store", Pragma: "no-cache", "Access-Control-Allow-Origin": "*" };

export async function POST(req: Request) {
  try {
    return Response.json(await token(await readParams(req), basicAuth(req)), { headers: HEADERS });
  } catch (e) {
    if (e instanceof RoomError) {
      const code = (e as RoomError & { code?: string }).code ?? "invalid_request";
      return Response.json({ error: code, error_description: e.message }, { status: e.status, headers: HEADERS });
    }
    console.error(e);
    return Response.json({ error: "server_error" }, { status: 500, headers: HEADERS });
  }
}
