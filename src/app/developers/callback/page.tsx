import type { Metadata } from "next";
import { Suspense } from "react";
import { Callback } from "@/components/callback";
import { ClientOnly } from "@/components/kit";

export const metadata: Metadata = { title: "OAuth callback", robots: { index: false } };

export default function Page() {
  return (
    <ClientOnly>
      <Suspense>
        <Callback />
      </Suspense>
    </ClientOnly>
  );
}
