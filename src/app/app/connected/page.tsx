import type { Metadata } from "next";
import { ConnectedApps } from "@/components/account";

export const metadata: Metadata = { title: "Connected apps" };

export default function Page() {
  return <ConnectedApps />;
}
