import { revokeToken } from "@/lib/oauth";
import { readParams } from "@/lib/oauth-http";

/** RFC 7009 token revocation: always 200, so it can't be used to test whether a token exists. */
export async function POST(req: Request) {
  const { token } = await readParams(req);
  if (token) await revokeToken(token);
  return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
}
