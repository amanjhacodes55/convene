import type { Metadata } from "next";
import { Suspense } from "react";
import { Consent } from "@/components/consent";
import { ClientOnly } from "@/components/kit";

export const metadata: Metadata = { title: "Authorize app", robots: { index: false } };

export default function Page() {
  return (
    <ClientOnly>
      <Suspense>
        <Consent />
      </Suspense>
    </ClientOnly>
  );
}
