"use client";

import { CalendarClock, Mic, MicOff, Sparkles, Video, VideoOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { saveEffect, savedEffect, type Effect } from "@/client/effects";
import { call, type Me } from "@/client/fetch";
import { audioConstraints, videoConstraints } from "@/client/meeting";
import { EffectPicker, usePreviewEffect } from "./effects";
import { Avatar, Logo } from "./ui";

export type RoomInfo = {
  code: string;
  title: string;
  locked: boolean;
  waitingRoom: boolean;
  ended: boolean;
  scheduledFor: number | null;
  owner: boolean;
  passcode: boolean;
  requireSignIn: boolean;
  registration: { requirePhone: boolean } | null;
};

export type Credentials = { passcode?: string; registration?: string };

type Devices = { audioinput: MediaDeviceInfo[]; videoinput: MediaDeviceInfo[]; audiooutput: MediaDeviceInfo[] };

const read = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

export async function listDevices(): Promise<Devices> {
  const all = await navigator.mediaDevices.enumerateDevices();
  const of = (kind: MediaDeviceKind) => all.filter((d) => d.kind === kind && d.deviceId);
  return { audioinput: of("audioinput"), videoinput: of("videoinput"), audiooutput: of("audiooutput") };
}

/** Lets someone check their camera and microphone and pick a name before going in. */
export function Lobby({ info, isHost, credentials, onJoin }: { info: RoomInfo; isHost: boolean; credentials: Credentials; onJoin: (stream: MediaStream, name: string, credentials: Credentials) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream] = useState(() => new MediaStream());
  const [name, setName] = useState(() => read("convene:name"));
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [level, setLevel] = useState(0);
  const [devices, setDevices] = useState<Devices>({ audioinput: [], videoinput: [], audiooutput: [] });
  const [cam, setCam] = useState(() => read("convene:camera"));
  const [mic, setMic] = useState(() => read("convene:mic"));
  const [speaker, setSpeaker] = useState(() => read("convene:speaker"));
  const [problem, setProblem] = useState("");
  const [error, setError] = useState("");
  /** Joining waits for the camera and microphone request to settle, or the call starts without them. */
  const [ready, setReady] = useState(false);
  const handedOff = useRef(false);
  const [effect, setEffect] = useState<Effect>(savedEffect);
  const [effects, showEffects] = useState(false);
  /** Bumped when the camera track changes, so the preview's effect picks up the new one. */
  const [camTrack, setCamTrack] = useState(0);
  usePreviewEffect(video, stream, effect, camOn, `${ready}:${camTrack}`);

  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [passcode, setPasscode] = useState(credentials.passcode ?? "");
  const [registrant, setRegistrant] = useState<{ name: string; email: string; status: string } | null>(null);

  // Signed in with no name saved here yet: use the account's name.
  useEffect(() => {
    call<{ user: Me | null }>("/api/auth/me").then(
      (r) => {
        setMe(r.user);
        if (r.user && !read("convene:name")) setName((n) => n || r.user!.name);
      },
      () => setMe(null),
    );
  }, []);

  // A personal registration link: show who it belongs to, and use their registered name.
  useEffect(() => {
    if (!info.registration || !credentials.registration) return;
    call<{ name: string; email: string; status: string }>(`/api/rooms/${info.code}/register?token=${encodeURIComponent(credentials.registration)}`).then(
      (r) => {
        setRegistrant(r);
        setName(r.name);
      },
      () => setRegistrant(null),
    );
  }, [info.code, info.registration, credentials.registration]);

  // What this meeting still needs from a guest before they can join.
  const needsSignIn = !isHost && info.requireSignIn && me === null;
  const needsRegistration = !isHost && Boolean(info.registration) && !credentials.registration;

  // Ask for both devices once; fall back to whatever is available.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const attempts: MediaStreamConstraints[] = [
        { audio: audioConstraints(mic || undefined), video: videoConstraints(cam || undefined) },
        { audio: audioConstraints() },
        { video: videoConstraints() },
      ];
      for (const c of attempts) {
        try {
          const s = await navigator.mediaDevices.getUserMedia(c);
          if (cancelled) return s.getTracks().forEach((t) => t.stop());
          s.getTracks().forEach((t) => stream.addTrack(t));
          if (!c.video) setCamOn(false);
          if (!c.audio) setMicOn(false);
          if (c !== attempts[0]) setProblem(c.audio ? "No camera found. You can still join with audio." : "No microphone found. Others won't hear you.");
          break;
        } catch {
          if (c === attempts.at(-1)) {
            setProblem("Camera and microphone are blocked. Allow them in your browser's site settings, or join without them.");
            setCamOn(false);
            setMicOn(false);
          }
        }
      }
      if (video.current) video.current.srcObject = stream;
      setReady(true);
      setDevices(await listDevices());
    })();
    const refresh = async () => setDevices(await listDevices());
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener("devicechange", refresh);
      // The tracks go to the meeting on join; otherwise the camera light must go off.
      if (!handedOff.current) stream.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once; device choices apply through the selects
  }, [stream]);

  // Microphone level meter.
  useEffect(() => {
    const [track] = stream.getAudioTracks();
    if (!track || !micOn) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      setLevel(Math.min(1, Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length) * 6));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close();
    };
  }, [stream, micOn, mic, devices]);

  async function swap(kind: "audio" | "video", deviceId: string) {
    const s = await navigator.mediaDevices.getUserMedia(kind === "video" ? { video: videoConstraints(deviceId) } : { audio: audioConstraints(deviceId) });
    const [track] = kind === "video" ? s.getVideoTracks() : s.getAudioTracks();
    (kind === "video" ? stream.getVideoTracks() : stream.getAudioTracks()).forEach((t) => {
      t.stop();
      stream.removeTrack(t);
    });
    if (kind === "audio") track.enabled = micOn;
    stream.addTrack(track);
    if (video.current) video.current.srcObject = stream;
    if (kind === "video") setCamTrack((n) => n + 1);
  }

  async function toggleCam() {
    if (camOn) {
      stream.getVideoTracks().forEach((t) => {
        t.stop();
        stream.removeTrack(t);
      });
      setCamOn(false);
    } else {
      try {
        await swap("video", cam);
        setCamOn(true);
      } catch {
        setProblem("Couldn't start the camera. Check that no other app is using it.");
      }
    }
  }

  function toggleMic() {
    stream.getAudioTracks().forEach((t) => (t.enabled = !micOn));
    setMicOn(!micOn);
  }

  function join() {
    if (!ready) return;
    const clean = name.trim();
    if (!clean) return setError("Enter your name so others know who you are.");
    if (!isHost && info.passcode && !passcode.trim()) return setError("Enter the meeting passcode.");
    write("convene:name", clean);
    handedOff.current = true;
    onJoin(stream, clean, { passcode: passcode.trim() || undefined, registration: credentials.registration });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-5 sm:px-6">
      <header className="flex items-center gap-2.5 text-lg font-semibold">
        <Logo /> Convene
      </header>
      <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-tile">
            <video ref={video} autoPlay playsInline muted className={`tile-video mirror ${camOn ? "" : "invisible"}`} />
            {!camOn && (
              <div className="absolute inset-0 grid place-items-center">
                <Avatar name={name || "You"} size={96} />
              </div>
            )}
            <span className="absolute left-3 top-3 rounded-md bg-black/50 px-2 py-1 text-sm">{name || "You"}</span>
            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3">
              <button className="ctl" data-off={!micOn} onClick={toggleMic} aria-label={micOn ? "Turn off microphone" : "Turn on microphone"} id="lobby-mic">
                <span>{micOn ? <Mic size={20} /> : <MicOff size={20} />}</span>
              </button>
              <button className="ctl" data-off={!camOn} onClick={toggleCam} aria-label={camOn ? "Turn off camera" : "Turn on camera"} id="lobby-cam">
                <span>{camOn ? <Video size={20} /> : <VideoOff size={20} />}</span>
              </button>
              <button className="ctl" data-on={effect !== "none"} onClick={() => showEffects(!effects)} aria-label="Backgrounds and effects" title="Backgrounds and effects" id="lobby-effects">
                <span>
                  <Sparkles size={20} />
                </span>
              </button>
            </div>
          </div>
          {effects && (
            <div className="card mt-3 p-4" id="lobby-effects-panel">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-medium">Backgrounds and effects</p>
                <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-raise" onClick={() => showEffects(false)} aria-label="Close backgrounds and effects">
                  <X size={17} />
                </button>
              </div>
              {!camOn && <p className="mb-3 text-sm text-warn">Turn on your camera to see the effect.</p>}
              <EffectPicker
                value={effect}
                onPick={(e) => {
                  setEffect(e);
                  saveEffect(e);
                }}
              />
            </div>
          )}
          <div className="mt-3 flex items-center gap-3 text-sm text-ink-2">
            <Mic size={15} />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raise" aria-label="Microphone level">
              <div className="h-full rounded-full bg-good transition-[width] duration-75" style={{ width: `${micOn ? level * 100 : 0}%` }} />
            </div>
          </div>
          {problem && <p className="mt-3 text-sm text-warn">{problem}</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <DeviceSelect
              label="Camera"
              list={devices.videoinput}
              value={cam}
              onChange={(id) => {
                setCam(id);
                write("convene:camera", id);
                if (camOn) void swap("video", id);
              }}
            />
            <DeviceSelect
              label="Microphone"
              list={devices.audioinput}
              value={mic}
              onChange={(id) => {
                setMic(id);
                write("convene:mic", id);
                void swap("audio", id);
              }}
            />
            <DeviceSelect
              label="Speaker"
              list={devices.audiooutput}
              value={speaker}
              onChange={(id) => {
                setSpeaker(id);
                write("convene:speaker", id);
              }}
            />
          </div>
        </div>

        <div className="lg:pl-4">
          <p className="text-sm text-ink-2">{isHost ? "You're the host of" : "You're joining"}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{info.title}</h1>
          <p className="mt-2 font-mono text-sm text-muted">{info.code}</p>
          {info.scheduledFor && (
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-2">
              <CalendarClock size={15} />
              {new Date(info.scheduledFor).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          )}
          {needsSignIn ? (
            <div className="mt-8 rounded-2xl border border-line bg-panel p-5" id="gate-signin">
              <p className="font-medium">This meeting is for signed-in users</p>
              <p className="mt-1 text-sm text-ink-2">The host asks everyone to sign in, so they know who joined.</p>
              <a className="btn btn-primary mt-4 w-full" href={`/signin?next=${encodeURIComponent(`/m/${info.code}`)}`}>
                Sign in to join
              </a>
            </div>
          ) : needsRegistration ? (
            <div className="mt-8 rounded-2xl border border-line bg-panel p-5" id="gate-register">
              <p className="font-medium">Registration required</p>
              <p className="mt-1 text-sm text-ink-2">Register with your details, then join with your personal link.</p>
              <a className="btn btn-primary mt-4 w-full" href={`/r/${info.code}`} id="go-register">
                Register for this meeting
              </a>
            </div>
          ) : (
            <>
              {registrant && (
                <p className="mt-6 rounded-xl bg-good/10 px-3 py-2 text-sm text-ink-2">
                  Registered as <span className="text-ink">{registrant.email}</span>
                  {registrant.status === "pending" && <span className="text-warn"> · waiting for the host to approve you</span>}
                </p>
              )}
              <label className="mt-8 block text-sm font-medium text-ink-2" htmlFor="name">
                Your name
              </label>
              <input
                id="name"
                className="input mt-2"
                value={name}
                maxLength={40}
                placeholder="e.g. Maya Chen"
                autoFocus
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && join()}
              />
              {!isHost && info.passcode && (
                <>
                  <label className="mt-4 block text-sm font-medium text-ink-2" htmlFor="passcode">
                    Meeting passcode
                  </label>
                  <input
                    id="passcode"
                    className="input mt-2 font-mono tracking-widest"
                    value={passcode}
                    maxLength={10}
                    placeholder="From your invitation"
                    onChange={(e) => {
                      setPasscode(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && join()}
                  />
                </>
              )}
              {error && <p className="mt-2 text-sm text-danger">{error}</p>}
              <button className="btn btn-primary mt-5 h-12 w-full text-base" onClick={join} id="join" disabled={!ready}>
                {!ready ? "Starting camera…" : info.waitingRoom && !isHost ? "Ask to join" : "Join now"}
              </button>
            </>
          )}
          {info.locked && !isHost && <p className="mt-3 text-sm text-warn">The host has locked this meeting, so new people can&apos;t join right now.</p>}
          {info.waitingRoom && !isHost && <p className="mt-3 text-sm text-ink-2">The host will let you in.</p>}
        </div>
      </div>
    </main>
  );
}

function DeviceSelect({ label, list, value, onChange }: { label: string; list: MediaDeviceInfo[]; value: string; onChange: (id: string) => void }) {
  if (!list.length) return null;
  return (
    <label className="text-xs text-muted">
      {label}
      <select className="input mt-1 h-10 text-sm" value={value || list[0].deviceId} onChange={(e) => onChange(e.target.value)}>
        {list.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
