import type { Metadata } from "next";
import { Downloads } from "@/components/downloads";
import { SiteHeader } from "@/components/site";

export const metadata: Metadata = {
  title: "Download",
  description: "Convene for macOS, Windows, Linux and Android: the same meetings and account as the website.",
};

export default function DownloadPage() {
  return (
    <div className="relative isolate w-full overflow-x-clip">
      <div className="aurora" aria-hidden />
      <SiteHeader active="download" />
      <Downloads />
    </div>
  );
}
