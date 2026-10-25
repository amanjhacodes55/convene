import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_DAYS, sessionUser } from "./accounts";
import { RoomError } from "./errors";

/** The signed-in account for this request, if any. */
export async function currentUser() {
  return sessionUser((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new RoomError(401, "Sign in to continue.");
  return user;
}

export async function setSession(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  jar.delete(SESSION_COOKIE);
  return token;
}
