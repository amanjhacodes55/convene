import { me, preflight, v1 } from "@/lib/api";

export const OPTIONS = preflight;

export async function GET(req: Request) {
  return v1(req, "user:read", async ({ user }) => me(user));
}
