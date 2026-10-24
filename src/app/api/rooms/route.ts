import { body, handle } from "@/lib/http";
import { createRoom } from "@/lib/rooms";

/** Starts a meeting. The host key in the response is the only proof of being its host. */
export async function POST(req: Request) {
  return handle(async () => {
    const { title, waitingRoom } = await body(req);
    return createRoom({ title: typeof title === "string" ? title : undefined, waitingRoom: waitingRoom === true });
  });
}
