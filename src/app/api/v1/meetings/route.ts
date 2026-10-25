import { meetingInput, preflight, v1 } from "@/lib/api";
import { body, originOf } from "@/lib/http";
import { createRoom, getRoom, listRooms, meetingJson } from "@/lib/rooms";

export const OPTIONS = preflight;

/** GET /api/v1/meetings?status=upcoming|live|ended: the account's meetings, newest first. */
export async function GET(req: Request) {
  return v1(req, "meeting:read", async ({ userId }) => {
    const status = new URL(req.url).searchParams.get("status");
    const all = (await listRooms(userId)).map(meetingJson);
    const meetings = status === "upcoming" ? all.filter((m) => m.status === "waiting") : status === "live" ? all.filter((m) => m.status === "started") : status === "ended" ? all.filter((m) => m.status === "ended") : all;
    return { total_records: meetings.length, meetings };
  });
}

/** POST /api/v1/meetings: schedule a meeting, or make one to start now. */
export async function POST(req: Request) {
  return v1(
    req,
    "meeting:write",
    async ({ userId, app }) => {
      const input = meetingInput(await body(req));
      const origin = originOf(req);
      const { code, hostKey } = await createRoom({ ...input, ownerId: userId, origin, appId: app.id });
      // start_url opens the meeting as its host on any device: the key rides in the #fragment,
      // which browsers never send to a server.
      return { ...meetingJson(await getRoom(code)), host_key: hostKey, start_url: `${origin}/m/${code}#host=${hostKey}` };
    },
    201,
  );
}
