import type { Metadata } from "next";
import { AppsPage } from "@/components/developers";

export const metadata: Metadata = { title: "Your apps" };

export default function Page() {
  return <AppsPage />;
}
