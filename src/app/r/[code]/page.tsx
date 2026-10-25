import type { Metadata } from "next";
import { Register } from "@/components/register";

export const metadata: Metadata = { title: "Register", robots: { index: false } };

export default async function Page({ params }: PageProps<"/r/[code]">) {
  return <Register code={(await params).code} />;
}
