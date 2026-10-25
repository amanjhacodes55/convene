import { meetingInput } from "@/lib/api";
import { body, handle, originOf, sameOrigin } from "@/lib/http";
import { createRoom, listRooms, meetingJson } from "@/lib/rooms";
import { requireUser } from "@/lib/session";

/** The dashboard's meetings: the same shape as the REST API, for the signed-in account. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return { meetings: (await listRooms(user.id)).map(meetingJson) };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const user = await requireUser();
    const input = meetingInput(await body(req));
    const { code, hostKey } = await createRoom({ ...input, ownerId: user.id, origin: originOf(req) });
    return { code, hostKey };
  });
}
