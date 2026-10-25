import type { Metadata } from "next";
import { AppPage } from "@/components/developers";

export const metadata: Metadata = { title: "App" };

export default async function Page({ params }: PageProps<"/developers/apps/[id]">) {
  return <AppPage id={(await params).id} />;
}
