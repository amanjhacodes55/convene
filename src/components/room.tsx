"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isCode } from "@/lib/codes";
import { Meeting } from "@/client/meeting";
import { Call } from "./call";
import { Lobby, type Credentials, type RoomInfo } from "./lobby";
import { Avatar, Logo, Screen } from "./ui";

/**
 * The host key for this meeting: from a start_url's #host= fragment (kept, then wiped from the
 * address bar), or saved when this browser started the meeting.
 */
const hostKeyFor = (code: string) => {
  const fromLink = new URLSearchParams(location.hash.slice(1)).get("host");
  try {
    if (fromLink) {
      localStorage.setItem(`convene:host:${code}`, fromLink);
      history.replaceState(null, "", location.pathname + location.search);
    }
    return localStorage.getItem(`convene:host:${code}`);
  } catch {
    return fromLink;
  }
};

/** A passcode from the invite link (?pwd=) and a personal registration token (?r=, or saved here). */
function credentialsFor(code: string): Credentials {
  const q = new URLSearchParams(location.search);
  const key = `convene:reg:${code}`;
  let registration = q.get("r") ?? undefined;
  try {
    if (registration) localStorage.setItem(key, registration);
    else registration = localStorage.getItem(key) ?? undefined;
  } catch {}
  return { passcode: q.get("pwd") ?? undefined, registration };
}

const noop = () => () => {};

/** The meeting named in the address bar (/m/<code>); "Loading…" on the server, which has no URL. */
export function RoomFromUrl() {
  const code = useSyncExternalStore(noop, () => location.pathname.match(/^\/m\/([^/]+)/)?.[1]?.toLowerCase() ?? "", () => null);
  if (code === null) return <Loading />;
  if (!isCode(code)) {
    return (
      <Screen title="Meeting not found" actions={<Link className="btn btn-primary" href="/">Start a new meeting</Link>}>
        Check the code or link you were given.
      </Screen>
    );
  }
  return <Room code={code} />;
}

export function Room({ code }: { code: string }) {
  const [info, setInfo] = useState<RoomInfo | { error: string; status: number } | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  // Read once; the page renders "Loading…" on the server, so there is nothing to hydrate against.
  const [hostKey] = useState(() => hostKeyFor(code));
  const [credentials] = useState(() => credentialsFor(code));

  useEffect(() => {
    fetch(`/api/rooms/${code}`)
      .then(async (r) => setInfo(r.ok ? await r.json() : { ...(await r.json()), status: r.status }))
      .catch(() => setInfo({ error: "Couldn't reach Convene. Check your connection.", status: 0 }));
  }, [code]);

  if (!info) return <Loading />;
  if ("error" in info) {
    return (
      <Screen title={info.status === 404 ? "Meeting not found" : "Something went wrong"} actions={<Link className="btn btn-primary" href="/">Start a new meeting</Link>}>
        {info.error}
      </Screen>
    );
  }
  if (info.ended) {
    return <Screen title="This meeting has ended" actions={<Link className="btn btn-primary" href="/">Start a new meeting</Link>} />;
  }
  if (!meeting) {
    return (
      <Lobby
        info={info}
        isHost={Boolean(hostKey) || info.owner}
        credentials={credentials}
        onJoin={(stream, name, creds) => {
          const m = new Meeting(code, name, stream, hostKey, creds);
          setMeeting(m);
          void m.join();
        }}
      />
    );
  }
  return <InMeeting meeting={meeting} onRejoin={() => setMeeting(null)} />;
}

function InMeeting({ meeting, onRejoin }: { meeting: Meeting; onRejoin: () => void }) {
  const state = useSyncExternalStore(meeting.subscribe, meeting.snapshot, meeting.snapshot);
  const home = (
    <Link className="btn" href="/">
      Back to home
    </Link>
  );
  const rejoin = (
    <button className="btn btn-primary" onClick={onRejoin}>
      Rejoin
    </button>
  );
  switch (state.phase) {
    case "joining":
      return <Loading text="Joining…" />;
    case "waiting":
      return (
        <Screen title="Waiting for the host to let you in" actions={<button className="btn" onClick={() => void meeting.leave()}>Leave</button>}>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Avatar name={state.self.name} size={40} />
            <span>{state.self.name}</span>
          </div>
          <p className="mt-4 text-sm text-muted">{state.title}</p>
        </Screen>
      );
    case "in":
      return <Call meeting={meeting} state={state} />;
    case "left":
      return <Screen title="You left the meeting" actions={<>{rejoin}{home}</>} />;
    case "ended":
      return (
        <Screen title={state.self.host ? "You ended the meeting for everyone" : "The host ended the meeting"} actions={home}>
          Thanks for joining {state.title}.
        </Screen>
      );
    case "removed":
      return <Screen title="You were removed from the meeting" actions={home} />;
    case "denied":
      return <Screen title="The host didn't let you in" actions={home}>You can ask them for another invitation.</Screen>;
    default:
      return <Screen title="Couldn't join" actions={<>{rejoin}{home}</>}>{state.error}</Screen>;
  }
}

function Loading({ text = "Loading…" }: { text?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-4 text-ink-2">
        <span className="animate-pulse">
          <Logo size={44} />
        </span>
        {text}
      </div>
    </main>
  );
}
