import { ArrowRight, CalendarDays, Captions, Code2, Hand, Lock, MessageSquare, Mic, MonitorUp, PenTool, Radio, ShieldCheck, Smile, Sparkles, Users, Video } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "@/components/site";
import { JoinMeeting, StartMeeting } from "@/components/start";
import { Avatar } from "@/components/ui";

const FEATURES = [
  { icon: Users, title: "HD video for small teams", text: "Up to 720p video and clear audio with echo cancellation and noise suppression, peer to peer." },
  { icon: MonitorUp, title: "Screen sharing", text: "Share a window, a tab or your whole screen. Everyone else sees it front and centre." },
  { icon: MessageSquare, title: "Chat and reactions", text: "Send messages and links during the call, react with emoji, and raise your hand to speak." },
  { icon: ShieldCheck, title: "Waiting room and host controls", text: "Let people in one by one, lock the meeting, mute participants or remove them." },
  { icon: Radio, title: "Record to your computer", text: "Record the whole meeting, every tile and voice, to a video file. Nothing is uploaded." },
  { icon: Captions, title: "Live captions", text: "Turn on captions and see what everyone says as they say it, transcribed in each speaker's own browser." },
  { icon: CalendarDays, title: "Scheduling and reports", text: "With a free account: schedule meetings, copy invitations, and see who attended and for how long." },
  { icon: PenTool, title: "Shared whiteboard", text: "Sketch an idea together: pens, shapes, text and a highlighter that everyone in the meeting draws on at once." },
  { icon: Sparkles, title: "Backgrounds and effects", text: "Blur your room or swap it for a picture of your own. It runs on your device, so your video never leaves it." },
  { icon: Lock, title: "Private by design", text: "Audio and video go straight between participants, encrypted with DTLS-SRTP. No account needed to join." },
];

/** Staggers a `.rise` element: the nth one starts n beats after the first. */
const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

const DEMO = [{ name: "Maya Chen", speaking: true }, { name: "Leo Park" }, { name: "Priya Nair", hand: true }, { name: "Sam Okafor", muted: true }];

export default function Home() {
  return (
    <div className="relative isolate w-full overflow-x-clip">
      <div className="aurora" aria-hidden />
      <div className="dot-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[52rem]" aria-hidden />
      <SiteHeader active="home" />

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:pt-20">
        <div>
          <span className="rise inline-flex items-center gap-2 rounded-full border border-line bg-panel/80 px-3 py-1 text-xs text-ink-2 shadow-sm backdrop-blur" style={i(0)}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
            </span>
            Open source · MIT licensed · No downloads
          </span>
          <h1 className="rise mt-5 text-balance text-4xl font-semibold leading-[1.06] tracking-tight sm:text-6xl" style={i(1)}>
            Video meetings that open in <span className="text-gradient">a browser tab</span>.
          </h1>
          <p className="rise mt-5 max-w-xl text-lg text-ink-2" style={i(2)}>
            Start a meeting, share the link, and talk. Screen sharing, chat, a shared whiteboard, background effects and recording, without an app or an account.
          </p>
          <div className="mt-8 grid max-w-xl gap-4">
            <div className="rise" style={i(3)}>
              <StartMeeting />
            </div>
            <div className="rise" style={i(4)}>
              <JoinMeeting />
            </div>
          </div>
        </div>

        <div className="rise relative" style={i(3)} aria-hidden>
          <div className="absolute -inset-10 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,var(--glow),transparent)]" />
          <div className="bob">
            <div className="card overflow-hidden p-3" style={{ boxShadow: "var(--shadow)" }}>
              <div className="flex items-center justify-between px-2 pb-3 text-xs text-ink-2">
                <span className="flex items-center gap-2">
                  <span className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  </span>
                  <span className="ml-1 font-medium text-ink">Design review</span>
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-danger/15 px-2 py-0.5 font-medium text-danger">
                  <span className="rec-dot h-1.5 w-1.5 rounded-full bg-danger" /> REC 12:48
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DEMO.map((p, n) => (
                  <div
                    key={p.name}
                    className={`tile-in relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-tile ${p.speaking ? "speaking" : ""}`}
                    style={{ animationDelay: `${400 + n * 120}ms` }}
                  >
                    <Avatar name={p.name} size={56} />
                    <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
                      {p.speaking && (
                        <span className="eq flex h-3 items-end gap-[2px]">
                          <i />
                          <i />
                          <i />
                        </span>
                      )}
                      {p.name}
                    </span>
                    {p.hand && (
                      <span className="absolute right-2 top-2 grid h-7 w-7 animate-bounce place-items-center rounded-full bg-warn text-black">
                        <Hand size={14} />
                      </span>
                    )}
                    {p.muted && <span className="absolute right-2 top-2 rounded-full bg-danger/90 px-1.5 text-[10px] text-white">muted</span>}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-center gap-2">
                {[Mic, Video, MonitorUp, Smile, MessageSquare].map((I, n) => (
                  <span key={n} className="grid h-9 w-9 place-items-center rounded-full bg-raise text-ink-2">
                    <I size={16} />
                  </span>
                ))}
                <span className="grid h-9 w-14 place-items-center rounded-full bg-danger text-xs font-medium text-white">Leave</span>
              </div>
            </div>
          </div>
          <span
            className="toast absolute -bottom-5 -left-4 hidden items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs shadow-lg sm:flex"
            style={{ animationDelay: "1.2s", animationFillMode: "both" }}
          >
            <span className="text-base">🎉</span> Priya reacted
          </span>
        </div>
      </section>

      <section className="border-y border-line bg-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Everything a meeting needs</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-ink-2">The features people reach for every day, in a tab that opens in a second.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {FEATURES.map((f, n) => (
              <div key={f.title} className="card card-hover rise p-5" style={i(n)}>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent-ink">
                  <f.icon size={20} />
                </span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-ink-2">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="card card-hover relative isolate flex flex-col items-start gap-6 overflow-hidden p-8 md:flex-row md:items-center">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,var(--glow),transparent_60%)]" aria-hidden />
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent to-[var(--accent-2)] text-white shadow-lg">
            <Code2 size={26} />
          </span>
          <div className="flex-1">
            <h2 className="text-xl font-semibold">Build on Convene</h2>
            <p className="mt-1 max-w-2xl text-ink-2">
              A REST API for meetings, OAuth 2.0 apps with scopes, and signed webhooks for every join and leave. Create meetings from your CRM and post into the meeting chat.
            </p>
          </div>
          <Link className="btn btn-primary h-11 px-5" href="/developers">
            Developer platform <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:px-6">
        <span>Convene is free software under the MIT License.</span>
        <span>Best for meetings of up to 8 people. Every connection is direct, so there is no media server to run.</span>
      </footer>
    </div>
  );
}
