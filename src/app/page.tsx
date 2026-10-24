import { Hand, Lock, MessageSquare, Mic, MonitorUp, Radio, ShieldCheck, Smile, Users, Video } from "lucide-react";
import { JoinMeeting, StartMeeting } from "@/components/start";
import { Avatar, Logo } from "@/components/ui";

const FEATURES = [
  { icon: Users, title: "HD video for small teams", text: "Up to 720p video and clear audio with echo cancellation and noise suppression, peer to peer." },
  { icon: MonitorUp, title: "Screen sharing", text: "Share a window, a tab or your whole screen. Everyone else sees it front and centre." },
  { icon: MessageSquare, title: "Chat and reactions", text: "Send messages and links during the call, react with emoji, and raise your hand to speak." },
  { icon: ShieldCheck, title: "Waiting room and host controls", text: "Let people in one by one, lock the meeting, mute participants or remove them." },
  { icon: Radio, title: "Record to your computer", text: "Record the whole meeting, every tile and voice, to a video file. Nothing is uploaded." },
  { icon: Lock, title: "Private by design", text: "Audio and video go straight between participants, encrypted with DTLS-SRTP. No accounts." },
];

const DEMO = [
  { name: "Maya Chen", speaking: true },
  { name: "Leo Park" },
  { name: "Priya Nair", hand: true },
  { name: "Sam Okafor", muted: true },
];

export default function Home() {
  return (
    <div className="w-full">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="flex items-center gap-2.5 text-lg font-semibold">
          <Logo /> Convene
        </span>
        <a className="btn border-transparent bg-transparent" href="https://github.com/amanjhacodes55/convene">
          GitHub
        </a>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:pt-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-ink-2">
            Open source · MIT licensed · No downloads
          </span>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Video meetings that open in{" "}
            <span className="bg-gradient-to-r from-[#8f9bff] to-[#b393ff] bg-clip-text text-transparent">a browser tab</span>.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-2">
            Start a meeting, share the link, and talk. Screen sharing, chat, reactions, waiting rooms and recording, without an app or an account.
          </p>
          <div className="mt-8 grid max-w-xl gap-4">
            <StartMeeting />
            <JoinMeeting />
          </div>
        </div>

        <div className="relative" aria-hidden>
          <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,rgba(109,124,255,.25),transparent)]" />
          <div className="card overflow-hidden p-3 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between px-2 pb-3 text-xs text-ink-2">
              <span className="font-medium text-ink">Design review</span>
              <span className="flex items-center gap-1.5">
                <span className="rec-dot h-2 w-2 rounded-full bg-danger" /> 12:48
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map((p) => (
                <div
                  key={p.name}
                  className="relative grid aspect-video place-items-center rounded-xl bg-tile"
                  style={{ boxShadow: p.speaking ? "inset 0 0 0 2px var(--speaking)" : undefined }}
                >
                  <Avatar name={p.name} size={56} />
                  <span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-xs">{p.name}</span>
                  {p.hand && <Hand size={18} className="absolute right-2 top-2 text-warn" />}
                  {p.muted && <span className="absolute right-2 top-2 rounded-full bg-danger/90 px-1.5 text-[10px]">muted</span>}
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-center gap-2">
              {[Mic, Video, MonitorUp, Smile, MessageSquare].map((I, i) => (
                <span key={i} className="grid h-9 w-9 place-items-center rounded-full bg-raise text-ink-2">
                  <I size={16} />
                </span>
              ))}
              <span className="grid h-9 w-14 place-items-center rounded-full bg-danger text-xs font-medium">Leave</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-panel/50">
        <div className="mx-auto grid max-w-6xl gap-px px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="p-5">
              <f.icon size={22} className="text-accent-ink" />
              <h2 className="mt-3 font-semibold">{f.title}</h2>
              <p className="mt-1.5 text-sm text-ink-2">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:px-6">
        <span>Convene is free software under the MIT License.</span>
        <span>Best for meetings of up to 8 people. Every connection is direct, so there is no media server to run.</span>
      </footer>
    </div>
  );
}
