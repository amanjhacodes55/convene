/** Token and revocation requests: form-encoded (the standard) or JSON. */
export async function readParams(req: Request): Promise<Record<string, string | undefined>> {
  const text = await req.text();
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      const j = JSON.parse(text);
      return Object.fromEntries(Object.entries(j ?? {}).map(([k, v]) => [k, typeof v === "string" ? v : undefined]));
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

/** Client credentials from an HTTP Basic header (client_id:client_secret). */
export function basicAuth(req: Request) {
  const m = req.headers.get("authorization")?.match(/^Basic\s+(\S+)$/i);
  if (!m) return null;
  const [id, ...rest] = Buffer.from(m[1], "base64").toString().split(":");
  return { id: decodeURIComponent(id), secret: decodeURIComponent(rest.join(":")) };
}
