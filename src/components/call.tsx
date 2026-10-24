"use client";

import {
  Hand,
  LayoutGrid,
  Link2,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  MoreHorizontal,
  PhoneOff,
  Radio,
  Settings,
  Smile,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Meeting, MeetingState } from "@/client/meeting";
import { Recorder } from "@/client/recorder";
import { listDevices } from "./lobby";
import { ChatPanel, PeoplePanel } from "./panels";
import { Tile, type TileProps } from "./tile";

const EMOJI = ["👍", "❤️", "😂", "😮", "👏", "🎉"];

type Layout = "grid" | "speaker";

export function Call({ meeting, state }: { meeting: Meeting; state: MeetingState }) {
  const [panel, setPanel] = useState<"chat" | "people" | null>(null);
  const [layout, setLayout] = useState<Layout>("grid");
  const [pin, setPinned] = useState<string | null>(null);
  const [menu, setMenu] = useState<"react" | "more" | "leave" | null>(null);
  const [settings, setSettings] = useState(false);
  const [seenChat, setSeenChat] = useState(0);
  // Video elements by participant, for the recorder. Held in state (never replaced), not a ref,
  // because tiles register into it from render.
  const [videos] = useState(() => new Map<string, HTMLVideoElement>());
  const [sinkId, setSinkId] = useState(() => {
    try {
      return localStorage.getItem("convene:speaker") ?? "";
    } catch {
      return "";
    }
  });
  const recorder = useRef<Recorder | null>(null);
  const { self, remotes } = state;

  // Chat counts as read while the panel is open, and up to the moment it closes.
  const received = state.chat.filter((m) => m.from !== "self").length;
  const unread = panel === "chat" ? 0 : received - seenChat;
  const showPanel = (next: "chat" | "people" | null) => {
    if (panel === "chat" || next === "chat") setSeenChat(received);
    setPanel(next);
  };

  // A fresh MediaStream when the camera changes, so the self view picks up a re-acquired track.
  const selfStream = useMemo(() => new MediaStream(meeting.local.getTracks()), [meeting, self.camOff]); // eslint-disable-line react-hooks/exhaustive-deps

  const reactionsOf = (id: string) => state.reactions.filter((r) => r.from === id);
  const ref = (id: string) => (el: HTMLVideoElement | null) => (el ? videos.set(id, el) : videos.delete(id));

  const tiles: TileProps[] = [
    {
      id: "self",
      name: self.name,
      stream: selfStream,
      showVideo: !self.camOff,
      mirror: true,
      micMuted: self.muted,
      hand: self.hand,
      host: self.host,
      recording: self.recording,
      speaking: state.speaking.includes("self"),
      reactions: reactionsOf("self"),
      videoRef: ref("self"),
    },
    ...remotes.map(
      (r): TileProps => ({
        id: r.id,
        name: r.name,
        stream: r.media,
        showVideo: !r.camOff && r.conn === "connected",
        micMuted: r.muted,
        hand: r.hand,
        host: r.host,
        recording: r.recording,
        speaking: state.speaking.includes(r.id),
        quality: r.conn === "connected" ? r.quality : 0,
        status: r.conn === "connecting" ? "Connecting…" : r.conn === "reconnecting" ? "Reconnecting…" : undefined,
        reactions: reactionsOf(r.id),
        videoRef: ref(r.id),
      }),
    ),
  ];
  // A pin lapses on its own when that person leaves.
  const pinned = tiles.some((t) => t.id === pin) ? pin : null;
  for (const t of tiles) Object.assign(t, { pinned: pinned === t.id, onPin: () => setPinned(pinned === t.id ? null : t.id) });

  const presenter = [...remotes].reverse().find((r) => r.sharing);

  // What fills the stage: someone's screen, the pinned or speaking person, or everyone in a grid.
  let main: ReactNode = null;
  let strip: TileProps[] = tiles;
  if (presenter) {
    main = <Tile id={`${presenter.id}:screen`} name={`${presenter.name}'s screen`} stream={presenter.screen} showVideo screen size="lg" />;
  } else if (self.sharing) {
    main = <SelfShare meeting={meeting} />;
  } else if (pinned || layout === "speaker") {
    const focus = tiles.find((t) => t.id === pinned) ?? tiles.find((t) => t.id === state.activeSpeaker && t.id !== "self") ?? tiles[1] ?? tiles[0];
    main = <Tile {...focus} size="lg" />;
    strip = tiles.filter((t) => t !== focus);
  }

  async function toggleRecording() {
    setMenu(null);
    if (recorder.current) {
      await recorder.current.stop();
      recorder.current = null;
      meeting.setRecording(false);
      meeting.toast("Recording saved to your downloads");
      return;
    }
    const cur = () => meeting.snapshot();
    recorder.current = new Recorder(
      () => [
        { name: cur().self.name, video: videos.get("self") ?? null, audio: meeting.local.getAudioTracks()[0] ?? null, showVideo: !cur().self.camOff },
        ...cur().remotes.map((r) => ({ name: r.name, video: videos.get(r.id) ?? null, audio: r.media.getAudioTracks()[0] ?? null, showVideo: !r.camOff })),
      ],
      state.title,
    );
    meeting.setRecording(true);
  }
  useEffect(() => () => void recorder.current?.stop(), []);

  async function toggleShare() {
    if (self.sharing) return meeting.stopShare();
    try {
      await meeting.startShare();
    } catch {
      // Cancelled in the browser's picker: nothing to do.
    }
  }

  function copyLink() {
    void navigator.clipboard.writeText(`${location.origin}/m/${state.code}`);
    meeting.toast("Invite link copied");
  }

  // Keyboard: M toggles the microphone, V the camera (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select")) return;
      if (e.key === "m") meeting.toggleMic();
      if (e.key === "v") void meeting.toggleCamera();
      if (e.key === "Escape") setMenu(null);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [meeting]);

  const recording = self.recording || remotes.some((r) => r.recording);

  return (
    <div className="flex h-dvh flex-col overflow-hidden" onClick={() => menu && setMenu(null)}>
      <header className="flex h-14 shrink-0 items-center gap-3 px-4">
        <h1 className="truncate font-semibold">{state.title}</h1>
        {state.settings.locked && <Lock size={15} className="text-warn" aria-label="Meeting locked" />}
        {recording && (
          <span className="flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-xs font-medium text-danger">
            <span className="rec-dot h-2 w-2 rounded-full bg-danger" /> Recording
          </span>
        )}
        <span className="ml-auto flex items-center gap-3 text-sm text-ink-2">
          <Elapsed since={state.startedAt} />
          <button className="flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-xs hover:bg-raise" onClick={copyLink} title="Copy invite link">
            <Link2 size={14} /> {state.code}
          </button>
          <HeaderButton label="People" on={panel === "people"} badge={self.host ? state.waiting.length : 0} onClick={() => showPanel(panel === "people" ? null : "people")} id="ctl-people">
            <Users size={18} />
            <span className="text-xs tabular-nums">{remotes.length + 1}</span>
          </HeaderButton>
          <HeaderButton label="Chat" on={panel === "chat"} badge={unread} onClick={() => showPanel(panel === "chat" ? null : "chat")} id="ctl-chat">
            <MessageSquare size={18} />
          </HeaderButton>
          <button
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-raise"
            onClick={() => {
              setPinned(null);
              setLayout(layout === "grid" ? "speaker" : "grid");
            }}
            title={layout === "grid" ? "Speaker view" : "Gallery view"}
            aria-label="Change layout"
          >
            <LayoutGrid size={17} />
          </button>
        </span>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 px-3">
        <main className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row">
          {main ? (
            <>
              <div className="min-h-0 min-w-0 flex-1">{main}</div>
              <div className="scroll-thin flex shrink-0 gap-3 overflow-auto lg:w-60 lg:flex-col">
                {strip.map((t) => (
                  <div key={t.id} className="aspect-video w-44 shrink-0 lg:w-full">
                    <Tile {...t} size="sm" />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Gallery tiles={tiles} />
          )}
        </main>
        {panel && (
          <div className="fixed inset-0 z-30 p-3 sm:static sm:z-auto sm:p-0">
            {panel === "chat" ? (
              <ChatPanel meeting={meeting} state={state} onClose={() => showPanel(null)} />
            ) : (
              <PeoplePanel meeting={meeting} state={state} onClose={() => showPanel(null)} onCopy={copyLink} />
            )}
          </div>
        )}
      </div>

      <div className="pointer-events-none fixed bottom-24 left-4 z-40 flex flex-col gap-2">
        {state.notices.map((n) => (
          <div key={n.id} className="toast rounded-xl border border-line bg-panel/95 px-4 py-2.5 text-sm shadow-lg">
            {n.text}
          </div>
        ))}
      </div>

      <footer className="relative flex h-20 shrink-0 items-center justify-center gap-1 px-3 sm:gap-2">
        <Control label={self.muted ? "Unmute" : "Mute"} off={self.muted} onClick={() => meeting.toggleMic()} id="ctl-mic" title="Microphone (M)">
          {self.muted ? <MicOff size={20} /> : <Mic size={20} />}
        </Control>
        <Control label={self.camOff ? "Start video" : "Stop video"} off={self.camOff} onClick={() => void meeting.toggleCamera()} id="ctl-cam" title="Camera (V)">
          {self.camOff ? <VideoOff size={20} /> : <Video size={20} />}
        </Control>
        <Control label={self.sharing ? "Stop share" : "Share"} on={self.sharing} onClick={() => void toggleShare()} id="ctl-share">
          {self.sharing ? <MonitorX size={20} /> : <MonitorUp size={20} />}
        </Control>
        <div className="relative">
          <Control label="React" onClick={(e) => (e.stopPropagation(), setMenu(menu === "react" ? null : "react"))} id="ctl-react">
            <Smile size={20} />
          </Control>
          {menu === "react" && (
            <Popover>
              <div className="flex gap-1 p-1.5">
                {EMOJI.map((e) => (
                  <button key={e} className="grid h-11 w-11 place-items-center rounded-xl text-2xl transition-transform hover:scale-110 hover:bg-raise" onClick={() => meeting.react(e)} aria-label={`React ${e}`}>
                    {e}
                  </button>
                ))}
              </div>
            </Popover>
          )}
        </div>
        <Control label={self.hand ? "Lower hand" : "Raise hand"} on={self.hand} onClick={() => meeting.toggleHand()} id="ctl-hand">
          <Hand size={20} />
        </Control>
        <div className="relative">
          <Control label="More" onClick={(e) => (e.stopPropagation(), setMenu(menu === "more" ? null : "more"))} id="ctl-more">
            <MoreHorizontal size={20} />
          </Control>
          {menu === "more" && (
            <Popover>
              <MenuItem icon={<Radio size={16} className={self.recording ? "text-danger" : ""} />} onClick={() => void toggleRecording()} id="menu-record">
                {self.recording ? "Stop recording" : "Record to this computer"}
              </MenuItem>
              <MenuItem
                icon={<LayoutGrid size={16} />}
                onClick={() => {
                  setPinned(null);
                  setLayout(layout === "grid" ? "speaker" : "grid");
                }}
              >
                {layout === "grid" ? "Speaker view" : "Gallery view"}
              </MenuItem>
              <MenuItem icon={<Settings size={16} />} onClick={() => setSettings(true)}>
                Audio and video settings
              </MenuItem>
            </Popover>
          )}
        </div>
        <div className="relative ml-1 sm:ml-3">
          <button
            className="btn btn-danger h-11 rounded-full px-5"
            onClick={(e) => {
              e.stopPropagation();
              if (self.host) setMenu(menu === "leave" ? null : "leave");
              else void meeting.leave();
            }}
            id="ctl-leave"
          >
            <PhoneOff size={18} /> <span className="hidden sm:inline">Leave</span>
          </button>
          {menu === "leave" && (
            <Popover align="right">
              <MenuItem icon={<PhoneOff size={16} className="text-danger" />} onClick={() => void meeting.leave(true)} id="menu-end">
                End meeting for everyone
              </MenuItem>
              <MenuItem icon={<X size={16} />} onClick={() => void meeting.leave()}>
                Leave meeting
              </MenuItem>
            </Popover>
          )}
        </div>
      </footer>

      {remotes.map((r) => (
        <RemoteAudio key={r.id} stream={r.media} sinkId={sinkId} />
      ))}
      {settings && <SettingsDialog meeting={meeting} sinkId={sinkId} setSinkId={setSinkId} onClose={() => setSettings(false)} />}
    </div>
  );
}

/** Tiles laid out as large as the stage allows while staying 16:9. */
function Gallery({ tiles }: { tiles: TileProps[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const gap = 12;
  const n = tiles.length;
  let best = 0;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const w = Math.min((size.w - gap * (cols - 1)) / cols, ((size.h - gap * (rows - 1)) / rows) * (16 / 9));
    best = Math.max(best, w);
  }
  return (
    <div ref={box} className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center" style={{ gap }}>
      {best > 0 &&
        tiles.map((t) => (
          <div key={t.id} style={{ width: best, height: (best * 9) / 16 }}>
            <Tile {...t} size={n > 6 ? "sm" : "md"} />
          </div>
        ))}
    </div>
  );
}

function SelfShare({ meeting }: { meeting: Meeting }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current && meeting.screen) video.current.srcObject = new MediaStream([meeting.screen]);
  }, [meeting.screen]);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl bg-tile p-6 text-center">
      <video ref={video} autoPlay playsInline muted className="max-h-[55%] max-w-[70%] rounded-xl border border-line" />
      <p className="text-lg font-medium">You&apos;re sharing your screen</p>
      <button className="btn btn-danger" onClick={() => void meeting.stopShare()}>
        <MonitorX size={17} /> Stop sharing
      </button>
    </div>
  );
}

function RemoteAudio({ stream, sinkId }: { stream: MediaStream; sinkId: string }) {
  const el = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (el.current && el.current.srcObject !== stream) el.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    const a = el.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (sinkId && a?.setSinkId) a.setSinkId(sinkId).catch(() => {});
  }, [sinkId]);
  return <audio ref={el} autoPlay />;
}

function Control(p: { label: string; children: ReactNode; onClick: (e: React.MouseEvent) => void; off?: boolean; on?: boolean; badge?: number; id?: string; title?: string }) {
  return (
    <button className="ctl" data-off={p.off ?? false} data-on={p.on ?? false} onClick={p.onClick} aria-label={p.label} title={p.title ?? p.label} id={p.id}>
      <span>
        {p.children}
        {p.badge ? (
          <b className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white">{p.badge}</b>
        ) : null}
      </span>
      <span className="hidden sm:block">{p.label}</span>
    </button>
  );
}

/** People and Chat live in the top bar, clear of anything a host pins to the bottom corners. */
function HeaderButton(p: { label: string; children: ReactNode; onClick: () => void; on: boolean; badge: number; id: string }) {
  return (
    <button
      className={`relative flex h-8 items-center gap-1.5 rounded-lg px-2 hover:bg-raise ${p.on ? "bg-raise text-ink" : ""}`}
      onClick={p.onClick}
      aria-label={p.label}
      title={p.label}
      id={p.id}
    >
      {p.children}
      {p.badge > 0 && (
        <b className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{p.badge}</b>
      )}
    </button>
  );
}

function Popover({ children, align = "center" }: { children: ReactNode; align?: "center" | "right" }) {
  return (
    <div
      className={`absolute bottom-[calc(100%+10px)] z-40 min-w-max rounded-2xl border border-line bg-panel p-1 shadow-2xl shadow-black/50 ${align === "right" ? "right-0" : "left-1/2 -translate-x-1/2"}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function MenuItem({ icon, children, onClick, id }: { icon: ReactNode; children: ReactNode; onClick: () => void; id?: string }) {
  return (
    <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-raise" onClick={onClick} id={id}>
      {icon}
      {children}
    </button>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(hh ? 2 : 1, "0");
  return <span className="tabular-nums">{hh ? `${hh}:` : ""}{mm}:{String(s % 60).padStart(2, "0")}</span>;
}

function SettingsDialog({ meeting, sinkId, setSinkId, onClose }: { meeting: Meeting; sinkId: string; setSinkId: (id: string) => void; onClose: () => void }) {
  const [devices, setDevices] = useState<Awaited<ReturnType<typeof listDevices>> | null>(null);
  useEffect(() => {
    void listDevices().then(setDevices);
  }, []);
  const current = (kind: "audio" | "video") => (kind === "audio" ? meeting.local.getAudioTracks() : meeting.local.getVideoTracks())[0]?.getSettings().deviceId ?? "";
  const save = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };
  const row = (label: string, list: MediaDeviceInfo[], value: string, onChange: (id: string) => void) =>
    list.length > 0 && (
      <label className="block text-sm text-ink-2">
        {label}
        <select className="input mt-1.5" defaultValue={value || list[0].deviceId} onChange={(e) => onChange(e.target.value)}>
          {list.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `${label} ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Audio and video</h2>
          <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-raise" onClick={onClose} aria-label="Close settings">
            <X size={18} />
          </button>
        </div>
        {!devices ? (
          <p className="text-sm text-muted">Loading devices…</p>
        ) : (
          <>
            {row("Microphone", devices.audioinput, current("audio"), (id) => {
              save("convene:mic", id);
              void meeting.switchDevice("audioinput", id);
            })}
            {row("Camera", devices.videoinput, current("video"), (id) => {
              save("convene:camera", id);
              void meeting.switchDevice("videoinput", id);
            })}
            {row("Speaker", devices.audiooutput, sinkId, (id) => {
              save("convene:speaker", id);
              setSinkId(id);
            })}
          </>
        )}
      </div>
    </div>
  );
}
