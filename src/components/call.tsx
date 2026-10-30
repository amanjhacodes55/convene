"use client";

import {
  BarChart3,
  Captions,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Expand,
  Hand,
  Keyboard,
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
  Presentation,
  Radio,
  Settings,
  ShieldCheck,
  Smile,
  Sparkles,
  Square,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Effect } from "@/client/effects";
import type { Meeting, MeetingState, Settings as RoomSettings } from "@/client/meeting";
import { Recorder } from "@/client/recorder";
import { EffectPicker } from "./effects";
import { listDevices } from "./lobby";
import { ChatPanel, PeoplePanel, PollsPanel } from "./panels";
import { Tile, type TileAction, type TileProps } from "./tile";
import { Avatar } from "./ui";
import { Whiteboard } from "./whiteboard";

const EMOJI = ["👍", "❤️", "😂", "😮", "👏", "🎉"];

type Layout = "grid" | "speaker";
type Menu = "react" | "more" | "leave" | "mic" | "cam" | "info" | "view" | "security" | null;
type PanelName = "chat" | "people" | "polls";
type Devices = Awaited<ReturnType<typeof listDevices>>;

const readPref = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};
const writePref = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

export function Call({ meeting, state }: { meeting: Meeting; state: MeetingState }) {
  const [panel, setPanel] = useState<PanelName | null>(null);
  const [layout, setLayout] = useState<Layout>("grid");
  const [pin, setPinned] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [dialog, setDialog] = useState<"settings" | "shortcuts" | "effects" | null>(null);
  const [hideSelf, setHideSelf] = useState(false);
  const [chatTo, setChatTo] = useState<string>("");
  const [seenChat, setSeenChat] = useState(0);
  const [devices, setDevices] = useState<Devices | null>(null);
  // Video elements by participant, for the recorder. Held in state (never replaced), not a ref,
  // because tiles register into it from render.
  const [videos] = useState(() => new Map<string, HTMLVideoElement>());
  const [sinkId, setSinkId] = useState(() => readPref("convene:speaker"));
  const recorder = useRef<Recorder | null>(null);
  const { self, remotes } = state;

  // Chat counts as read while the panel is open, and up to the moment it closes.
  const received = state.chat.filter((m) => m.from !== "self").length;
  const unread = panel === "chat" ? 0 : received - seenChat;
  const showPanel = (next: PanelName | null) => {
    if (panel === "chat" || next === "chat") setSeenChat(received);
    setPanel(next);
  };

  // A fresh MediaStream when the camera or its effect changes, so the self view picks up the new track.
  const selfStream = useMemo(() => meeting.preview(), [meeting, self.camOff, state.effect]); // eslint-disable-line react-hooks/exhaustive-deps

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
      you: true,
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
  const spotlight = tiles.some((t) => t.id === state.spotlight) ? state.spotlight : null;
  for (const t of tiles) {
    const actions: TileAction[] = [{ label: pinned === t.id ? "Unpin" : "Pin for me", run: () => setPinned(pinned === t.id ? null : t.id) }];
    if (self.host) actions.push({ label: spotlight === t.id ? "Remove spotlight" : "Spotlight for everyone", run: () => meeting.setSpotlight(spotlight === t.id ? null : t.id) });
    if (t.id !== "self") {
      actions.push({ label: "Message privately", run: () => (setChatTo(t.id), showPanel("chat")) });
      if (self.host && !t.micMuted) actions.push({ label: "Mute", run: () => meeting.muteParticipant(t.id) });
      if (self.host) actions.push({ label: "Remove from meeting", run: () => meeting.remove(t.id), danger: true });
    } else {
      actions.push({ label: hideSelf ? "Show self view" : "Hide self view", run: () => setHideSelf(!hideSelf) });
    }
    Object.assign(t, { pinned: pinned === t.id, spotlit: spotlight === t.id, actions });
  }

  // With sharing limited to hosts, a participant's share is ignored even if their browser sends it.
  const presenter = [...remotes].reverse().find((r) => r.sharing && (r.host || state.settings.share === "everyone"));
  const visible = hideSelf && tiles.length > 1 ? tiles.filter((t) => t.id !== "self") : tiles;

  // What fills the stage: someone's screen, the whiteboard, the spotlit, pinned or speaking person, or a grid.
  let main: ReactNode = null;
  let strip: TileProps[] = visible;
  if (presenter) {
    main = <Tile id={`${presenter.id}:screen`} name={`${presenter.name}'s screen`} stream={presenter.screen} showVideo screen size="lg" />;
  } else if (self.sharing) {
    main = <SelfShare meeting={meeting} />;
  } else if (state.board) {
    main = <Whiteboard meeting={meeting} state={state} />;
  } else if (spotlight || pinned || layout === "speaker") {
    const focus =
      tiles.find((t) => t.id === spotlight) ?? tiles.find((t) => t.id === pinned) ?? tiles.find((t) => t.id === state.activeSpeaker && t.id !== "self") ?? tiles[1] ?? tiles[0];
    main = <Tile {...focus} size="lg" />;
    strip = visible.filter((t) => t.id !== focus.id);
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

  const link = typeof location !== "undefined" ? `${location.origin}/m/${state.code}` : "";
  function copyLink() {
    void navigator.clipboard?.writeText(link);
    meeting.toast("Invite link copied");
  }
  function copyInvitation() {
    void navigator.clipboard?.writeText(`${self.name} is inviting you to a Convene meeting.\n\nTopic: ${state.title}\n\nJoin from your browser:\n${link}\n\nMeeting ID: ${state.code}`);
    meeting.toast("Invitation copied");
  }

  function toggleBoard() {
    setMenu(null);
    if (!state.board) meeting.openBoard();
    else if (meeting.mayManageBoard("self")) meeting.closeBoard();
    else meeting.toast("Only the host or whoever opened the whiteboard can close it");
  }

  const openDevices = async (m: "mic" | "cam") => {
    setMenu(menu === m ? null : m);
    setDevices(await listDevices());
  };

  // Keyboard, as in Zoom and Teams. Not while typing.
  const keys = useRef({ panel, showPanel });
  useLayoutEffect(() => {
    keys.current = { panel, showPanel };
  });
  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]");
    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      const { panel, showPanel } = keys.current;
      if (e.key === "m") meeting.toggleMic();
      else if (e.key === "v") void meeting.toggleCamera();
      else if (e.key === "h") meeting.toggleHand();
      else if (e.key === "c") showPanel(panel === "chat" ? null : "chat");
      else if (e.key === "p") showPanel(panel === "people" ? null : "people");
      else if (e.key === "?") setDialog("shortcuts");
      else if (e.key === "Escape") setMenu(null);
      else if (e.key === " " && !e.repeat && !(e.target as HTMLElement).closest("button")) {
        e.preventDefault();
        meeting.holdToTalk(true);
      }
    };
    const onUp = (e: KeyboardEvent) => e.key === " " && meeting.holdToTalk(false);
    addEventListener("keydown", onDown);
    addEventListener("keyup", onUp);
    return () => {
      removeEventListener("keydown", onDown);
      removeEventListener("keyup", onUp);
    };
  }, [meeting]);

  const recording = self.recording || remotes.some((r) => r.recording);
  const host = remotes.find((r) => r.host)?.name ?? (self.host ? self.name : "");

  // The bar holds as many of these as fit, in this order, between Chat and More; the rest move into
  // More, as Zoom and Meet do on narrow windows and phones.
  const canShare = self.host || state.settings.share === "everyone";
  const unvoted = state.polls.filter((p) => !p.mine && p.voted === null && !p.closed).length;
  const emoji = (after?: () => void) =>
    EMOJI.map((e) => (
      <button key={e} className="grid h-10 w-10 place-items-center rounded-xl text-xl transition-transform hover:scale-110 hover:bg-raise sm:h-11 sm:w-11 sm:text-2xl" onClick={() => (meeting.react(e), after?.())} aria-label={`React ${e}`}>
        {e}
      </button>
    ));
  const extras: { key: string; bar: ReactNode; menu: ReactNode; badge?: number }[] = [
    {
      key: "share",
      bar: (
        <Control label={self.sharing ? "Stop share" : "Share"} share={canShare} onClick={() => void toggleShare()} id="ctl-share" on={self.sharing} title={canShare ? "Share screen" : "Only the host can share"}>
          {self.sharing ? <MonitorX size={20} /> : <MonitorUp size={20} />}
        </Control>
      ),
      menu: (
        <MenuItem icon={self.sharing ? <MonitorX size={16} /> : <MonitorUp size={16} />} onClick={() => (setMenu(null), void toggleShare())} id="menu-share">
          {self.sharing ? "Stop sharing" : "Share screen"}
        </MenuItem>
      ),
    },
    {
      key: "react",
      bar: (
        <div className="relative">
          <Control label="React" onClick={() => setMenu(menu === "react" ? null : "react")} id="ctl-react">
            <Smile size={20} />
          </Control>
          {menu === "react" && (
            <Popover>
              <div className="flex justify-between gap-1 p-1.5">{emoji()}</div>
              <button className="flex w-full items-center justify-center gap-2 rounded-xl border-t border-line px-3 py-2 text-sm hover:bg-raise" onClick={() => (meeting.toggleHand(), setMenu(null))}>
                <Hand size={16} className="text-warn" /> {self.hand ? "Lower hand" : "Raise hand"}
              </button>
            </Popover>
          )}
        </div>
      ),
      menu: <div className="flex justify-between gap-0.5 px-1 pb-1">{emoji(() => setMenu(null))}</div>,
    },
    ...(self.host
      ? [
          {
            key: "security",
            bar: (
              <div className="relative">
                <Control label="Security" on={menu === "security"} onClick={() => setMenu(menu === "security" ? null : "security")} id="ctl-security" title="Security">
                  <ShieldCheck size={20} />
                </Control>
                {menu === "security" && (
                  <Popover align="left" offset={-40}>
                    <SecurityMenu settings={state.settings} set={(patch) => void meeting.updateSettings(patch)} />
                  </Popover>
                )}
              </div>
            ),
            menu: (
              <MenuItem icon={<ShieldCheck size={16} />} onClick={() => setMenu("security")} id="menu-security">
                Security
              </MenuItem>
            ),
          },
        ]
      : []),
    {
      key: "hand",
      bar: (
        <Control label={self.hand ? "Lower hand" : "Raise hand"} on={self.hand} onClick={() => meeting.toggleHand()} id="ctl-hand" title="Raise hand (H)">
          <Hand size={20} />
        </Control>
      ),
      menu: (
        <MenuItem icon={<Hand size={16} className={self.hand ? "text-warn" : ""} />} onClick={() => (meeting.toggleHand(), setMenu(null))} id="menu-hand">
          {self.hand ? "Lower hand" : "Raise hand"}
        </MenuItem>
      ),
    },
    {
      key: "board",
      bar: (
        <Control label="Whiteboard" on={Boolean(state.board)} onClick={toggleBoard} id="ctl-board" title={canShare ? "Whiteboard" : "Only the host can open a whiteboard"}>
          <Presentation size={20} />
        </Control>
      ),
      menu: (
        <MenuItem icon={<Presentation size={16} className={state.board ? "text-accent-ink" : ""} />} onClick={toggleBoard} id="menu-board">
          {state.board ? "Close whiteboard" : "Whiteboard"}
        </MenuItem>
      ),
    },
    {
      key: "polls",
      badge: unvoted,
      bar: (
        <Control label="Polls" on={panel === "polls"} badge={unvoted} onClick={() => showPanel(panel === "polls" ? null : "polls")} id="ctl-polls">
          <BarChart3 size={20} />
        </Control>
      ),
      menu: (
        <MenuItem icon={<BarChart3 size={16} />} onClick={() => (setMenu(null), showPanel("polls"))} id="menu-polls">
          Polls{unvoted ? <b className="ml-auto rounded-full bg-danger px-1.5 text-[10px] text-white">{unvoted}</b> : null}
        </MenuItem>
      ),
    },
    {
      key: "captions",
      bar: (
        <Control label="Captions" on={self.cc} onClick={() => meeting.toggleCaptions()} id="ctl-cc" title={state.captionsUnavailable ? "Live captions need Chrome or Edge" : "Live captions"}>
          <Captions size={20} />
        </Control>
      ),
      menu: (
        <MenuItem icon={<Captions size={16} className={self.cc ? "text-accent-ink" : ""} />} onClick={() => (meeting.toggleCaptions(), setMenu(null))} id="menu-cc">
          {self.cc ? "Turn off captions" : "Live captions"}
        </MenuItem>
      ),
    },
    {
      key: "record",
      bar: (
        <Control label={self.recording ? "Stop rec." : "Record"} onClick={() => void toggleRecording()} id="ctl-record" rec={self.recording} title="Record to this computer">
          {self.recording ? <Square size={17} fill="currentColor" /> : <Radio size={20} />}
        </Control>
      ),
      menu: (
        <MenuItem icon={<Radio size={16} className={self.recording ? "text-danger" : ""} />} onClick={() => void toggleRecording()} id="menu-record">
          {self.recording ? "Stop recording" : "Record to this computer"}
        </MenuItem>
      ),
    },
  ];
  const { footerRef, leftRef, middleRef, rightRef, moreRef, room } = useFit();
  const inBar = extras.slice(0, room);
  const inMore = extras.slice(room);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#0a0b0f]" onClick={() => menu && setMenu(null)}>
      <header className="flex h-12 shrink-0 items-center gap-2 px-3">
        <div className="relative min-w-0">
          <button
            className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-raise"
            onClick={(e) => (e.stopPropagation(), setMenu(menu === "info" ? null : "info"))}
            id="meeting-info"
            aria-label="Meeting information"
          >
            <ShieldCheck size={17} className="shrink-0 text-good" />
            <span className="truncate text-sm font-semibold">{state.title}</span>
            <ChevronDown size={14} className="shrink-0 text-muted" />
          </button>
          {menu === "info" && (
            <Popover place="below">
              <div className="w-full p-3 sm:w-80">
                <h3 className="font-semibold">{state.title}</h3>
                <dl className="mt-3 grid grid-cols-[96px_1fr] gap-y-2 text-sm">
                  <dt className="text-muted">Meeting ID</dt>
                  <dd className="font-mono">{state.code}</dd>
                  {host && (
                    <>
                      <dt className="text-muted">Host</dt>
                      <dd>{host}</dd>
                    </>
                  )}
                  <dt className="text-muted">Invite link</dt>
                  <dd className="truncate text-accent-ink">{link.replace(/^https?:\/\//, "")}</dd>
                  <dt className="text-muted">Encryption</dt>
                  <dd className="flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-good" /> Peer to peer, DTLS-SRTP
                  </dd>
                </dl>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button className="btn h-9 text-xs" onClick={copyLink} id="copy-link">
                    <Link2 size={14} /> Copy link
                  </button>
                  <button className="btn h-9 text-xs" onClick={copyInvitation}>
                    <ClipboardCopy size={14} /> Copy invitation
                  </button>
                </div>
              </div>
            </Popover>
          )}
        </div>
        {state.settings.locked && <Lock size={15} className="shrink-0 text-warn" aria-label="Meeting locked" />}
        {recording && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-xs font-medium text-danger">
            <span className="rec-dot h-2 w-2 rounded-full bg-danger" /> Recording
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-sm text-ink-2">
          <span className="mr-2 rounded-md bg-raise/70 px-2 py-0.5 font-mono text-xs">
            <Elapsed since={state.startedAt} />
          </span>
          <div className="relative">
            <button className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 hover:bg-raise" onClick={(e) => (e.stopPropagation(), setMenu(menu === "view" ? null : "view"))} aria-label="Change layout" id="ctl-view">
              <LayoutGrid size={16} /> <span className="hidden text-xs sm:inline">View</span>
            </button>
            {menu === "view" && (
              <Popover place="below" align="right">
                <MenuItem icon={layout === "speaker" && !pinned ? <Check size={16} /> : <span className="w-4" />} onClick={() => (setPinned(null), setLayout("speaker"), setMenu(null))} id="view-speaker">
                  Speaker
                </MenuItem>
                <MenuItem icon={layout === "grid" && !pinned ? <Check size={16} /> : <span className="w-4" />} onClick={() => (setPinned(null), setLayout("grid"), setMenu(null))} id="view-gallery">
                  Gallery
                </MenuItem>
                <div className="my-1 h-px bg-line" />
                <MenuItem icon={hideSelf ? <Check size={16} /> : <span className="w-4" />} onClick={() => (setHideSelf(!hideSelf), setMenu(null))}>
                  Hide self view
                </MenuItem>
                <MenuItem
                  icon={<Expand size={16} />}
                  onClick={() => {
                    setMenu(null);
                    if (document.fullscreenElement) void document.exitFullscreen();
                    else void document.documentElement.requestFullscreen?.().catch(() => {});
                  }}
                >
                  Full screen
                </MenuItem>
              </Popover>
            )}
          </div>
        </span>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 px-3">
        <main className="relative flex min-w-0 flex-1 flex-col gap-3 lg:flex-row">
          {main ? (
            <>
              <div className="min-h-0 min-w-0 flex-1">{main}</div>
              {strip.length > 0 && (
                <div className="scroll-thin flex shrink-0 gap-3 overflow-auto lg:w-60 lg:flex-col">
                  {strip.map((t) => (
                    <div key={t.id} className="aspect-video w-44 shrink-0 lg:w-full">
                      <Tile {...t} size="sm" />
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Gallery tiles={visible} />
          )}
          {state.captions.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-6" aria-live="polite" id="captions">
              <div className="max-w-3xl space-y-1 rounded-xl bg-black/75 px-4 py-2.5 text-center backdrop-blur">
                {state.captions.map((c) => (
                  <p key={c.from} className="text-[17px] leading-snug">
                    <span className="mr-2 font-semibold text-accent-ink">{c.from === "self" ? "You" : c.name}:</span>
                    {c.text}
                  </p>
                ))}
              </div>
            </div>
          )}
        </main>
        {panel && (
          <div className="fixed inset-0 z-30 p-3 sm:static sm:z-auto sm:p-0">
            {panel === "chat" ? (
              <ChatPanel meeting={meeting} state={state} to={chatTo} setTo={setChatTo} onClose={() => showPanel(null)} />
            ) : (
              panel === "people" ? (
                <PeoplePanel meeting={meeting} state={state} onClose={() => showPanel(null)} onCopy={copyLink} onMessage={(id) => (setChatTo(id), showPanel("chat"))} />
              ) : (
                <PollsPanel meeting={meeting} state={state} onClose={() => showPanel(null)} />
              )
            )}
          </div>
        )}
      </div>

      <div className="pointer-events-none fixed bottom-24 left-4 z-40 flex flex-col gap-2">
        {state.notices.map((n) => (
          <div key={n.id} className="toast pointer-events-auto flex items-center gap-3 rounded-xl border border-line bg-panel/95 px-4 py-2.5 text-sm shadow-lg">
            <span>{n.text}</span>
            {n.action && (
              <button
                className="btn btn-primary h-7 rounded-lg px-3 text-xs"
                onClick={() => {
                  n.action!.run();
                  meeting.dismiss(n.id);
                }}
              >
                {n.action.label}
              </button>
            )}
          </div>
        ))}
      </div>

      {state.talkingWhileMuted && (
        <div className="toast fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm shadow-xl" id="muted-hint">
          <MicOff size={16} className="text-danger" />
          You&apos;re muted. Press M or hold Space to talk.
          <button className="btn btn-primary h-7 rounded-lg px-3 text-xs" onClick={() => meeting.toggleMic()}>
            Unmute
          </button>
        </div>
      )}

      <footer ref={footerRef} className="relative flex h-[76px] shrink-0 items-center gap-1 px-3 sm:gap-2" onClick={(e) => e.stopPropagation()}>
        <div ref={leftRef} className="relative flex shrink-0 items-center gap-1">
          <Split
            label={self.muted ? "Unmute" : "Mute"}
            off={self.muted}
            onClick={() => meeting.toggleMic()}
            onMenu={() => void openDevices("mic")}
            open={menu === "mic"}
            id="ctl-mic"
            title="Microphone (M, or hold Space)"
          >
            {self.muted ? <MicOff size={20} /> : <Mic size={20} />}
          </Split>
          {menu === "mic" && (
            <Popover align="left">
              <DeviceMenu
                sections={[
                  { title: "Microphone", list: devices?.audioinput ?? [], value: meeting.local.getAudioTracks()[0]?.getSettings().deviceId ?? "", pick: (id) => (writePref("convene:mic", id), void meeting.switchDevice("audioinput", id)) },
                  { title: "Speaker", list: devices?.audiooutput ?? [], value: sinkId || "default", pick: (id) => (writePref("convene:speaker", id), setSinkId(id)) },
                ]}
                onSettings={() => (setMenu(null), setDialog("settings"))}
                settingsLabel="Audio settings…"
              />
            </Popover>
          )}
          <Split
            label={self.camOff ? "Start video" : "Stop video"}
            off={self.camOff}
            onClick={() => void meeting.toggleCamera(readPref("convene:camera") || undefined)}
            onMenu={() => void openDevices("cam")}
            open={menu === "cam"}
            id="ctl-cam"
            title="Camera (V)"
          >
            {self.camOff ? <VideoOff size={20} /> : <Video size={20} />}
          </Split>
          {menu === "cam" && (
            <Popover align="left" offset={92}>
              <DeviceMenu
                sections={[
                  { title: "Camera", list: devices?.videoinput ?? [], value: meeting.local.getVideoTracks()[0]?.getSettings().deviceId ?? "", pick: (id) => (writePref("convene:camera", id), void meeting.switchDevice("videoinput", id)) },
                ]}
                extra={
                  <MenuItem icon={<Sparkles size={16} />} onClick={() => (setMenu(null), setDialog("effects"))} id="menu-cam-effects">
                    Backgrounds and effects…
                  </MenuItem>
                }
                onSettings={() => (setMenu(null), setDialog("settings"))}
                settingsLabel="Video settings…"
              />
            </Popover>
          )}
        </div>

        {/* Never scrolls: that would clip the popovers. useFit decides how many extras fit instead. */}
        <div ref={middleRef} className="mx-auto flex min-w-0 items-center gap-0.5 sm:gap-1">
          <Control
            label="Participants"
            on={panel === "people"}
            badge={self.host ? state.waiting.length : 0}
            count={state.settings.hideCount && !self.host ? 0 : remotes.length + 1}
            onClick={() => showPanel(panel === "people" ? null : "people")}
            id="ctl-people"
            title="Participants (P)"
          >
            <Users size={20} />
          </Control>
          <Control label="Chat" on={panel === "chat"} badge={unread} onClick={() => showPanel(panel === "chat" ? null : "chat")} id="ctl-chat" title="Chat (C)">
            <MessageSquare size={20} />
          </Control>
          {inBar.map((x) => (
            <div key={x.key} className="contents">
              {x.bar}
            </div>
          ))}
          <div className="relative">
            <Control label="More" onClick={() => setMenu(menu === "more" ? null : "more")} id="ctl-more" badge={inMore.reduce((n, x) => n + (x.badge ?? 0), 0)} ref={moreRef}>
              <MoreHorizontal size={20} />
            </Control>
            {menu === "more" && (
              <Popover align="right">
                {inMore.length > 0 && (
                  <>
                    {inMore.map((x) => (
                      <div key={x.key}>{x.menu}</div>
                    ))}
                    <div className="my-1 h-px bg-line" />
                  </>
                )}
                <MenuItem icon={<Sparkles size={16} className={state.effect !== "none" ? "text-accent-ink" : ""} />} onClick={() => (setMenu(null), setDialog("effects"))} id="menu-effects">
                  Backgrounds and effects
                </MenuItem>
                <MenuItem icon={<Link2 size={16} />} onClick={() => (copyLink(), setMenu(null))}>
                  Copy invite link
                </MenuItem>
                <MenuItem icon={<Settings size={16} />} onClick={() => (setMenu(null), setDialog("settings"))}>
                  Audio and video settings
                </MenuItem>
                <MenuItem icon={<Keyboard size={16} />} onClick={() => (setMenu(null), setDialog("shortcuts"))}>
                  Keyboard shortcuts
                </MenuItem>
              </Popover>
            )}
            {menu === "security" && inMore.some((x) => x.key === "security") && (
              <Popover align="right">
                <SecurityMenu settings={state.settings} set={(patch) => void meeting.updateSettings(patch)} />
              </Popover>
            )}
          </div>
        </div>

        <div ref={rightRef} className="relative shrink-0">
          <button
            className="btn btn-danger h-10 rounded-xl px-4"
            onClick={() => {
              if (self.host) setMenu(menu === "leave" ? null : "leave");
              else void meeting.leave();
            }}
            id="ctl-leave"
          >
            <PhoneOff size={18} /> <span className="hidden sm:inline">{self.host ? "End" : "Leave"}</span>
          </button>
          {menu === "leave" && (
            <Popover align="right">
              <div className="w-full p-1 sm:w-64">
                <button className="btn btn-danger w-full" onClick={() => void meeting.leave(true)} id="menu-end">
                  End meeting for all
                </button>
                <button className="btn mt-2 w-full" onClick={() => void meeting.leave()} id="menu-leave">
                  Leave meeting
                </button>
              </div>
            </Popover>
          )}
        </div>
      </footer>

      {remotes.map((r) => (
        <RemoteAudio key={r.id} stream={r.media} sinkId={sinkId} />
      ))}
      {dialog === "settings" && <SettingsDialog meeting={meeting} sinkId={sinkId} setSinkId={setSinkId} onClose={() => setDialog(null)} />}
      {dialog === "shortcuts" && <Shortcuts onClose={() => setDialog(null)} />}
      {dialog === "effects" && <EffectsDialog meeting={meeting} stream={selfStream} effect={state.effect} camOff={self.camOff} onClose={() => setDialog(null)} />}
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
  const gap = 8;
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
      <video ref={video} autoPlay playsInline muted className="max-h-[55%] max-w-[70%] rounded-xl border-2 border-good/70" />
      <p className="flex items-center gap-2 text-lg font-medium">
        <span className="rec-dot h-2.5 w-2.5 rounded-full bg-good" /> You&apos;re sharing your screen
      </p>
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

type ControlProps = {
  label: string;
  children: ReactNode;
  onClick: () => void;
  off?: boolean;
  on?: boolean;
  share?: boolean;
  rec?: boolean;
  badge?: number;
  count?: number;
  id?: string;
  title?: string;
  ref?: React.Ref<HTMLButtonElement>;
};

/** A control-bar button: an icon with its label underneath, as in desktop meeting apps. */
function Control({ ref, ...p }: ControlProps) {
  return (
    <button ref={ref} className="bar-btn" data-off={p.off ?? false} data-on={p.on ?? false} data-share={p.share ?? false} data-rec={p.rec ?? false} onClick={p.onClick} aria-label={p.label} title={p.title ?? p.label} id={p.id}>
      <span>
        {p.children}
        {p.count ? <i className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-raise px-1 text-[10px] font-semibold not-italic text-ink ring-2 ring-[#0a0b0f]">{p.count}</i> : null}
        {p.badge ? <b className="absolute -left-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white ring-2 ring-[#0a0b0f]">{p.badge}</b> : null}
      </span>
      <span className="hidden max-w-full truncate sm:block">{p.label}</span>
    </button>
  );
}

/**
 * How many optional controls fit in the bar: the room between the mic and camera on the left and
 * Leave on the right, in More-button-sized slots, less the three that always show.
 */
function useFit() {
  const footer = useRef<HTMLElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const middle = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const els = [footer.current!, left.current!, right.current!];
    const measure = () => {
      const f = getComputedStyle(footer.current!);
      const gap = parseFloat(getComputedStyle(middle.current!).columnGap) || 0;
      const free = footer.current!.clientWidth - parseFloat(f.paddingLeft) - parseFloat(f.paddingRight) - 2 * (parseFloat(f.columnGap) || 0) - left.current!.offsetWidth - right.current!.offsetWidth;
      const slot = more.current!.offsetWidth + gap;
      setRoom(Math.max(0, Math.floor((free + gap) / slot) - 3));
    };
    const ro = new ResizeObserver(measure);
    els.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, []);
  return { footerRef: footer, leftRef: left, rightRef: right, middleRef: middle, moreRef: more, room };
}

/** Microphone and camera: the button toggles, the chevron opens the device menu. */
function Split(p: { label: string; children: ReactNode; onClick: () => void; onMenu: () => void; open: boolean; off: boolean; id: string; title: string }) {
  return (
    <div className="bar-btn split" data-off={p.off}>
      <span className="flex items-center">
        <button className="grid h-full w-full place-items-center" onClick={p.onClick} aria-label={p.label} title={p.title} id={p.id}>
          {p.children}
        </button>
        <button className="chev max-sm:hidden" onClick={p.onMenu} aria-label={`${p.label.includes("video") ? "Camera" : "Audio"} options`} aria-expanded={p.open}>
          {p.open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      </span>
      <span className="hidden sm:block">{p.label}</span>
    </div>
  );
}

/** The host's Security menu, as in Zoom: lock, waiting room, and what participants may do. */
function SecurityMenu({ settings, set }: { settings: RoomSettings; set: (patch: Partial<RoomSettings>) => void }) {
  const item = (label: string, on: boolean, patch: Partial<RoomSettings>, id: string) => (
    <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-raise" onClick={() => set(patch)} id={id} role="menuitemcheckbox" aria-checked={on}>
      {on ? <Check size={15} className="shrink-0 text-accent-ink" /> : <span className="w-[15px] shrink-0" />}
      {label}
    </button>
  );
  const head = (t: string) => <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t}</div>;
  return (
    <div className="w-full p-1 sm:w-72" role="menu">
      {item("Lock meeting", settings.locked, { locked: !settings.locked }, "sec-lock")}
      {item("Enable waiting room", settings.waitingRoom, { waitingRoom: !settings.waitingRoom }, "sec-waiting")}
      {item("Hide participant count", settings.hideCount, { hideCount: !settings.hideCount }, "sec-hide-count")}
      {item("Hide participant list", settings.hideList, { hideList: !settings.hideList }, "sec-hide-list")}
      {head("Allow participants to")}
      {item("Share their screen", settings.share === "everyone", { share: settings.share === "everyone" ? "host" : "everyone" }, "sec-share")}
      {item("Chat with everyone", settings.chat === "everyone", { chat: "everyone" }, "sec-chat-all")}
      {item("Chat with the host only", settings.chat === "host", { chat: "host" }, "sec-chat-host")}
      {item("Chat: off", settings.chat === "off", { chat: "off" }, "sec-chat-off")}
      {item("Unmute themselves", settings.allowUnmute, { allowUnmute: !settings.allowUnmute }, "sec-unmute")}
      {item("Join muted", settings.muteOnEntry, { muteOnEntry: !settings.muteOnEntry }, "sec-mute-entry")}
    </div>
  );
}

function DeviceMenu({ sections, onSettings, settingsLabel, extra }: { sections: { title: string; list: MediaDeviceInfo[]; value: string; pick: (id: string) => void }[]; onSettings: () => void; settingsLabel: string; extra?: ReactNode }) {
  return (
    <div className="w-full p-1 sm:w-72">
      {sections.map((s) => (
        <div key={s.title} className="mb-1">
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Select a {s.title.toLowerCase()}</div>
          {!s.list.length && <div className="px-3 py-1.5 text-sm text-muted">Loading…</div>}
          {s.list.map((d, i) => (
            <button key={d.deviceId} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-raise" onClick={() => s.pick(d.deviceId)}>
              {d.deviceId === s.value || (!s.value && i === 0) ? <Check size={15} className="shrink-0 text-accent-ink" /> : <span className="w-[15px] shrink-0" />}
              <span className="truncate">{d.label || `${s.title} ${i + 1}`}</span>
            </button>
          ))}
        </div>
      ))}
      <div className="my-1 h-px bg-line" />
      {extra}
      <MenuItem icon={<Settings size={16} />} onClick={onSettings}>
        {settingsLabel}
      </MenuItem>
    </div>
  );
}

/** A menu by its button; on phones, a sheet across the screen above the bar (or below the header). */
function Popover({ children, align = "center", place = "above", offset = 0 }: { children: ReactNode; align?: "center" | "right" | "left"; place?: "above" | "below"; offset?: number }) {
  const x = align === "right" ? "sm:right-0" : align === "left" ? "sm:left-[var(--off)]" : "sm:left-1/2 sm:-translate-x-1/2";
  const y = place === "above" ? "bottom-[84px] sm:bottom-[calc(100%+10px)] max-h-[calc(100dvh-6.5rem)]" : "top-14 sm:top-[calc(100%+6px)] max-h-[calc(100dvh-4.5rem)]";
  return (
    <div
      className={`scroll-thin fixed inset-x-3 z-40 overflow-y-auto rounded-2xl border border-line bg-panel p-1 shadow-2xl shadow-black/50 sm:absolute sm:inset-x-auto sm:min-w-max ${y} ${x}`}
      style={{ "--off": `${offset}px` } as CSSProperties}
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
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  return (
    <span className="tabular-nums">
      {hh ? `${hh}:` : ""}
      {mm}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className={`card w-full space-y-4 p-5 sm:p-6 ${wide ? "max-w-xl" : "max-w-md"}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-raise" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const SHORTCUTS = [
  ["M", "Mute or unmute"],
  ["Space (hold)", "Talk while muted"],
  ["V", "Start or stop video"],
  ["H", "Raise or lower your hand"],
  ["C", "Open or close chat"],
  ["P", "Open or close participants"],
  ["?", "Show these shortcuts"],
  ["Esc", "Close menus"],
];

function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose}>
      <div className="divide-y divide-line">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-2 text-sm">
            <span className="text-ink-2">{v}</span>
            <kbd className="rounded-md border border-line bg-raise px-2 py-0.5 font-mono text-xs">{k}</kbd>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function EffectsDialog({ meeting, stream, effect, camOff, onClose }: { meeting: Meeting; stream: MediaStream; effect: Effect; camOff: boolean; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  return (
    <Dialog title="Backgrounds and effects" onClose={onClose} wide>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-tile">
        <video ref={video} autoPlay playsInline muted className={`tile-video mirror ${camOff ? "invisible" : ""}`} />
        {camOff && <p className="absolute inset-0 grid place-items-center text-sm text-muted">Your camera is off</p>}
      </div>
      <EffectPicker value={effect} onPick={(e) => void meeting.setEffect(e)} />
    </Dialog>
  );
}

function SettingsDialog({ meeting, sinkId, setSinkId, onClose }: { meeting: Meeting; sinkId: string; setSinkId: (id: string) => void; onClose: () => void }) {
  const [devices, setDevices] = useState<Devices | null>(null);
  useEffect(() => {
    void listDevices().then(setDevices);
  }, []);
  const current = (kind: "audio" | "video") => (kind === "audio" ? meeting.local.getAudioTracks() : meeting.local.getVideoTracks())[0]?.getSettings().deviceId ?? "";
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
    <Dialog title="Audio and video" onClose={onClose}>
      {!devices ? (
        <p className="text-sm text-muted">Loading devices…</p>
      ) : (
        <>
          {row("Microphone", devices.audioinput, current("audio"), (id) => {
            writePref("convene:mic", id);
            void meeting.switchDevice("audioinput", id);
          })}
          {row("Camera", devices.videoinput, current("video"), (id) => {
            writePref("convene:camera", id);
            void meeting.switchDevice("videoinput", id);
          })}
          {row("Speaker", devices.audiooutput, sinkId, (id) => {
            writePref("convene:speaker", id);
            setSinkId(id);
          })}
        </>
      )}
      <div className="flex items-center gap-3 border-t border-line pt-4 text-sm text-ink-2">
        <Avatar name={meeting.snapshot().self.name} size={28} />
        <span>
          Hold <kbd className="rounded border border-line bg-raise px-1.5 font-mono text-xs">Space</kbd> to talk while muted.
        </span>
      </div>
    </Dialog>
  );
}
