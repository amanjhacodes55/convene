import type { Metadata } from "next";
import { MeetingDetail } from "@/components/meetings";

export const metadata: Metadata = { title: "Meeting" };

export default async function Page({ params }: PageProps<"/app/meetings/[code]">) {
  return <MeetingDetail code={(await params).code} />;
}
