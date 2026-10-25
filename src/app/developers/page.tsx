import { ArrowRight, BookOpen, KeyRound, Webhook, Workflow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Json } from "@/components/kit";
import { SiteHeader } from "@/components/site";
import { EVENTS, SCOPES } from "@/lib/catalog";

export const metadata: Metadata = { title: "Developers", description: "Build on Convene: a REST API for meetings, OAuth 2.0 apps with scopes, and signed webhooks." };

const PILLARS = [
  { icon: Workflow, title: "REST API", text: "Schedule, update and end meetings, read live participants and attendance reports, and post into the meeting chat." },
  { icon: KeyRound, title: "OAuth 2.0 and scopes", text: "Authorization code with PKCE for apps people install, client credentials for your own servers. Ask only for what you need." },
  { icon: Webhook, title: "Signed webhooks", text: "Hear when meetings start and end and when people join or leave, signed with HMAC-SHA256, with a delivery log and redelivery." },
];

export default function Developers() {
  return (
    <div className="w-full">
      <SiteHeader active="developers" />
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-ink-2">Convene Developer Platform</span>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            Put meetings{" "}
            <span className="bg-gradient-to-r from-[#8f9bff] to-[#b393ff] bg-clip-text text-transparent">inside your product</span>.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-2">
            Create a meeting from your CRM, react the moment a customer joins, and keep attendance in sync. One REST API, OAuth apps with scopes, and webhooks.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn btn-primary h-11 px-5" href="/developers/apps" id="dev-start">
              Create an app <ArrowRight size={16} />
            </Link>
            <Link className="btn h-11 px-5" href="/developers/docs">
              <BookOpen size={16} /> Read the docs
            </Link>
          </div>
        </div>
        <div className="card overflow-hidden p-0 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="ml-3 font-mono text-xs text-muted">create-meeting.sh</span>
          </div>
          <div className="space-y-3 p-4">
            <Json
              className="border-0 bg-transparent p-0"
              value={`curl -X POST https://convene-meet.netlify.app/api/v1/meetings \\\n  -H "Authorization: Bearer $ACCESS_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"topic":"Onboarding call","start_time":"2026-11-02T15:00:00Z","duration":30}'`}
            />
            <Json
              className="border-0 bg-transparent p-0"
              value={{ id: "kfa-wqpz-tnu", topic: "Onboarding call", status: "waiting", start_time: "2026-11-02T15:00:00.000Z", duration: 30, join_url: "https://convene-meet.netlify.app/m/kfa-wqpz-tnu" }}
            />
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-panel/50">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="card p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/15 text-accent-ink">
                <p.icon size={21} />
              </span>
              <h2 className="mt-4 font-semibold">{p.title}</h2>
              <p className="mt-1.5 text-sm text-ink-2">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold">Scopes</h2>
          <p className="mt-1 text-sm text-ink-2">Each token carries only the scopes the user granted.</p>
          <div className="mt-4 divide-y divide-line rounded-2xl border border-line">
            {Object.entries(SCOPES).map(([s, t]) => (
              <div key={s} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <code className="w-40 shrink-0 font-mono text-[13px] text-accent-ink">{s}</code>
                <span className="text-sm text-ink-2">{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Webhook events</h2>
          <p className="mt-1 text-sm text-ink-2">Subscribe per app, test against a built-in inbox, and redeliver from the log.</p>
          <div className="mt-4 divide-y divide-line rounded-2xl border border-line">
            {Object.entries(EVENTS).map(([e, v]) => (
              <div key={e} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <code className="w-40 shrink-0 font-mono text-[13px] text-accent-ink">{e}</code>
                <span className="text-sm text-ink-2">{v.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
