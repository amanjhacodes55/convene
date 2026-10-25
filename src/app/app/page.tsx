import type { Metadata } from "next";
import { MeetingsPage } from "@/components/meetings";

export const metadata: Metadata = { title: "Meetings" };

export default function Page() {
  return <MeetingsPage />;
}
