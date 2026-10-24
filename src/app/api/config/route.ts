import { connection } from "next/server";

// ICE servers for WebRTC. Public STUN finds a direct route for most networks; for strict
// corporate NATs set TURN_URLS (comma separated), TURN_USERNAME and TURN_CREDENTIAL.
export async function GET() {
  await connection(); // read the environment at request time, not at build time
  const iceServers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
  const turn = process.env.TURN_URLS?.split(",").map((u) => u.trim()).filter(Boolean);
  if (turn?.length) iceServers.push({ urls: turn, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  return Response.json({ iceServers }, { headers: { "Cache-Control": "no-store" } });
}
