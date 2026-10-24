import type { Metadata } from "next";
import { RoomFromUrl } from "@/components/room";

export const metadata: Metadata = { title: "Meeting", robots: { index: false } };

// Every /m/<code> URL is rewritten to this one static page (see next.config.ts), so meeting links
// load from the CDN instead of waking a server function. The code is read from the address bar.
export default function MeetingPage() {
  return <RoomFromUrl />;
}
