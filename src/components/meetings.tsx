"use client";

import { CalendarDays, CalendarPlus, ClipboardCopy, Download, Pencil, Play, Trash2, Users, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { call, useResource } from "@/client/fetch";
import { parseCode } from "./start";
import { Badge, CopyField, Empty, Field, Modal, Tabs } from "./kit";
import { PageTitle, PortalShell, usePortalUser } from "./portal";
import { Avatar } from "./ui";

export type ApiMeeting = {
  id: string;
  topic: string;
  agenda: string;
  status: "waiting" | "started" | "ended";
  start_time: string | null;
  duration: number | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  join_url: string;
  settings: { waiting_room: boolean; locked: boolean };
};

type Person = { id: string; name: string; host: boolean; joined_at: string };
type Row = Person & { left_at: string | null; duration: number; reason: string | null };

const when = (m: ApiMeeting) => new Date(m.start_time ?? m.started_at ?? m.created_at);
const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtDay = (d: Date) => d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const fmtDur = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);

export function invitation(m: ApiMeeting, host: string) {
  const zone = new Intl.DateTimeFormat([], { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";
  const lines = [`${host} is inviting you to a Convene meeting.`, "", `Topic: ${m.topic}`];
  if (m.start_time) lines.push(`Time: ${fmtDay(when(m))}, ${fmtTime(when(m))} ${zone}${m.duration ? ` (${m.duration} min)` : ""}`);
  lines.push("", "Join from your browser, no download needed:", m.join_url, "", `Meeting ID: ${m.id}`);
  return lines.join("\n");
}

function StatusBadge({ m }: { m: ApiMeeting }) {
  if (m.status === "started")
    return (
      <Badge tone="good">
        <span className="rec-dot h-1.5 w-1.5 rounded-full bg-good" /> Live
      </Badge>
    );
  if (m.status === "ended") return <Badge>Ended</Badge>;
  return m.start_time ? <Badge tone="accent">Scheduled</Badge> : <Badge tone="accent">Ready</Badge>;
}

/** Schedule a new meeting, or edit one. Dates are entered in the browser's time zone. */
function ScheduleForm({ meeting, onDone }: { meeting?: ApiMeeting; onDone: (m: ApiMeeting | { code: string }) => void }) {
  // A new meeting defaults to the next half hour that is at least 30 minutes away.
  const [start] = useState(() => (meeting?.start_time ? new Date(meeting.start_time) : new Date(Math.ceil((Date.now() + 30 * 60_000) / 1_800_000) * 1_800_000)));
  const pad = (n: number) => String(n).padStart(2, "0");
  const [topic, setTopic] = useState(meeting?.topic ?? "");
  const [date, setDate] = useState(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
  const [time, setTime] = useState(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
  const [duration, setDuration] = useState(meeting?.duration ?? 30);
  const [agenda, setAgenda] = useState(meeting?.agenda ?? "");
  const [waitingRoom, setWaitingRoom] = useState(meeting?.settings.waiting_room ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const payload = { topic: topic || "Meeting", agenda, start_time: new Date(`${date}T${time}`).toISOString(), duration, settings: { waiting_room: waitingRoom } };
    try {
      if (meeting) onDone((await call<{ meeting: ApiMeeting }>(`/api/meetings/${meeting.id}`, "PATCH", payload)).meeting);
      else onDone(await call<{ code: string }>("/api/meetings", "POST", payload));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field label="Topic">
        <input className="input" id="sched-topic" value={topic} maxLength={80} placeholder="Weekly design review" onChange={(e) => setTopic(e.target.value)} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
        <Field label="Date">
          <input className="input" type="date" id="sched-date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Time">
          <input className="input" type="time" id="sched-time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </Field>
        <Field label="Duration">
          <select className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {[15, 30, 45, 60, 90, 120, 180].map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} min` : `${d / 60} h${d % 60 ? ` ${d % 60} min` : ""}`}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Agenda" hint="Optional. Shown on the meeting page and sent to your apps.">
        <textarea className="input h-24 resize-none py-2.5" id="sched-agenda" value={agenda} maxLength={2000} onChange={(e) => setAgenda(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={waitingRoom} onChange={(e) => setWaitingRoom(e.target.checked)} />
        Waiting room: I&apos;ll admit people
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn btn-primary h-11 w-full" disabled={busy} id="sched-save">
        {busy ? "Saving…" : meeting ? "Save changes" : "Schedule"}
      </button>
    </form>
  );
}

export function MeetingsPage() {
  return (
    <PortalShell actions={<HeaderActions />}>
      <MeetingsList />
    </PortalShell>
  );
}

function HeaderActions() {
  const router = useRouter();
  const [join, setJoin] = useState(false);
  const [code, setCode] = useState("");
  const parsed = parseCode(code);
  return (
    <>
      <button className="btn h-9 border-transparent bg-transparent text-sm" onClick={() => setJoin(true)}>
        Join
      </button>
      <button
        className="btn btn-primary h-9 text-sm"
        id="host-now"
        onClick={async () => {
          const { code } = await call<{ code: string }>("/api/meetings", "POST", { topic: "Instant meeting" });
          router.push(`/m/${code}`);
        }}
      >
        <Video size={16} /> Host a meeting
      </button>
      {join && (
        <Modal title="Join a meeting" onClose={() => setJoin(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (parsed) router.push(`/m/${parsed}`);
            }}
          >
            <input className="input" autoFocus placeholder="Meeting ID or link" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn btn-primary mt-4 w-full" disabled={!parsed}>
              Join
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

function MeetingsList() {
  const me = usePortalUser();
  const router = useRouter();
  const { data, reload } = useResource<{ meetings: ApiMeeting[] }>("/api/meetings");
  const [tab, setTab] = useState<"upcoming" | "previous">("upcoming");
  const [scheduling, setScheduling] = useState(false);
  const [copied, setCopied] = useState("");

  const all = data?.meetings ?? [];
  const upcoming = all.filter((m) => m.status !== "ended").sort((a, b) => Number(b.status === "started") - Number(a.status === "started") || when(a).getTime() - when(b).getTime());
  const previous = all.filter((m) => m.status === "ended").sort((a, b) => when(b).getTime() - when(a).getTime());
  const list = tab === "upcoming" ? upcoming : previous;

  const copy = (m: ApiMeeting) => {
    void navigator.clipboard?.writeText(invitation(m, me.name));
    setCopied(m.id);
    setTimeout(() => setCopied(""), 1500);
  };

  return (
    <>
      <PageTitle title="Meetings" sub="Schedule meetings, send invitations, and see who came.">
        <button className="btn btn-primary" onClick={() => setScheduling(true)} id="schedule">
          <CalendarPlus size={17} /> Schedule a meeting
        </button>
      </PageTitle>
      <Tabs
        tabs={[
          { id: "upcoming", label: `Upcoming${upcoming.length ? ` (${upcoming.length})` : ""}` },
          { id: "previous", label: "Previous" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="mt-4 space-y-2">
        {data && !list.length && (
          <Empty icon={<CalendarDays size={22} />} title={tab === "upcoming" ? "No upcoming meetings" : "No previous meetings yet"}>
            {tab === "upcoming" ? "Schedule one, or host a meeting right now. Meetings you make through the API show up here too." : "Meetings you've ended appear here, with attendance reports."}
          </Empty>
        )}
        {list.map((m) => {
          const d = when(m);
          return (
            <div key={m.id} className="card group flex cursor-pointer items-center gap-4 p-4 transition-colors hover:border-accent/50" onClick={() => router.push(`/app/meetings/${m.id}`)} data-meeting={m.id}>
              <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-raise py-2 text-center">
                <span className="text-[11px] font-semibold uppercase text-accent-ink">{d.toLocaleDateString([], { month: "short" })}</span>
                <span className="text-xl font-semibold leading-tight">{d.getDate()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{m.topic}</span>
                  <StatusBadge m={m} />
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-ink-2">
                  <span>
                    {fmtDay(d)}, {fmtTime(d)}
                    {m.duration ? ` · ${m.duration} min` : ""}
                  </span>
                  <span className="font-mono text-xs leading-5 text-muted">ID {m.id}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {m.status !== "ended" && (
                  <>
                    <button className="btn hidden h-9 text-sm sm:inline-flex" onClick={() => copy(m)}>
                      <ClipboardCopy size={15} /> {copied === m.id ? "Copied" : "Copy invitation"}
                    </button>
                    <Link className="btn btn-primary h-9 text-sm" href={`/m/${m.id}`}>
                      <Play size={15} /> {m.status === "started" ? "Join" : "Start"}
                    </Link>
                  </>
                )}
                {m.status === "ended" && (
                  <Link className="btn h-9 text-sm" href={`/app/meetings/${m.id}`}>
                    <Users size={15} /> Report
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {scheduling && (
        <Modal title="Schedule a meeting" onClose={() => setScheduling(false)}>
          <ScheduleForm
            onDone={() => {
              setScheduling(false);
              setTab("upcoming");
              reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}

export function MeetingDetail({ code }: { code: string }) {
  return (
    <PortalShell>
      <Detail code={code} />
    </PortalShell>
  );
}

function Detail({ code }: { code: string }) {
  const me = usePortalUser();
  const router = useRouter();
  const { data, error, reload, setData } = useResource<{ meeting: ApiMeeting; participants: Person[]; waiting: Person[]; report: Row[] }>(`/api/meetings/${code}`);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const live = data?.meeting.status === "started";

  // While the meeting is on, keep the live roster fresh.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [live, reload]);

  if (error) return <Empty icon={<CalendarDays size={22} />} title="Meeting not found">{error}</Empty>;
  if (!data) return <p className="text-ink-2">Loading…</p>;
  const m = data.meeting;
  const d = when(m);

  const csv = () => {
    const rows = [["Name", "Host", "Joined", "Left", "Duration (s)", "Reason"], ...data.report.map((r) => [r.name, r.host ? "yes" : "", r.joined_at, r.left_at ?? "", String(r.duration), r.reason ?? ""])];
    const blob = new Blob([rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${m.topic} attendance.csv` });
    a.click();
  };

  return (
    <>
      <Link href="/app" className="text-sm text-ink-2 hover:text-ink">
        ← Meetings
      </Link>
      <PageTitle
        title={
          <span className="flex items-center gap-3">
            {m.topic} <StatusBadge m={m} />
          </span>
        }
        sub={`${fmtDay(d)}, ${fmtTime(d)}${m.duration ? ` · ${m.duration} min` : ""}`}
      >
        {m.status !== "ended" && (
          <>
            <button className="btn" onClick={() => setEditing(true)}>
              <Pencil size={15} /> Edit
            </button>
            <Link className="btn btn-primary" href={`/m/${m.id}`} id="start-meeting">
              <Play size={15} /> {live ? "Join" : "Start"}
            </Link>
          </>
        )}
      </PageTitle>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section className="card space-y-4 p-5">
          <CopyField label="Invite link" value={m.join_url} />
          <div className="grid gap-4 sm:grid-cols-2">
            <CopyField label="Meeting ID" value={m.id} />
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Security</div>
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                <Badge tone={m.settings.waiting_room ? "good" : "neutral"}>Waiting room {m.settings.waiting_room ? "on" : "off"}</Badge>
                {m.settings.locked && <Badge tone="warn">Locked</Badge>}
                <Badge tone="accent">Encrypted peer to peer</Badge>
              </div>
            </div>
          </div>
          {m.agenda && (
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Agenda</div>
              <p className="whitespace-pre-wrap text-sm text-ink-2">{m.agenda}</p>
            </div>
          )}
          {m.status !== "ended" && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <button
                className="btn h-9 text-sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(invitation(m, me.name));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                <ClipboardCopy size={15} /> {copied ? "Copied" : "Copy invitation"}
              </button>
              {!live && (
                <button className="btn h-9 text-sm text-danger" onClick={() => setConfirm(true)}>
                  <Trash2 size={15} /> Delete
                </button>
              )}
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Users size={17} className="text-accent-ink" /> {live ? "In the meeting now" : "Participants"}
          </h2>
          {!live && <p className="mt-2 text-sm text-ink-2">{m.status === "ended" ? "This meeting has ended. The attendance report is below." : "Nobody has joined yet. Start the meeting, or send the invitation."}</p>}
          {live && (
            <ul className="mt-3 space-y-1">
              {data.participants.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg py-1.5">
                  <Avatar name={p.name} size={30} />
                  <span className="flex-1 truncate text-sm">{p.name}</span>
                  {p.host && <Badge>Host</Badge>}
                </li>
              ))}
              {data.waiting.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg py-1.5 opacity-70">
                  <Avatar name={p.name} size={30} />
                  <span className="flex-1 truncate text-sm">{p.name}</span>
                  <Badge tone="warn">Waiting</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {data.report.length > 0 && (
        <section className="card mt-5 overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="font-semibold">Attendance report</h2>
            <button className="btn h-8 text-xs" onClick={csv}>
              <Download size={14} /> CSV
            </button>
          </div>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr className="border-y border-line">
                  <th className="px-5 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Joined</th>
                  <th className="px-3 py-2 font-medium">Left</th>
                  <th className="px-5 py-2 text-right font-medium">Time in meeting</th>
                </tr>
              </thead>
              <tbody>
                {data.report.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={r.name} size={26} /> {r.name} {r.host && <Badge>Host</Badge>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">{fmtTime(new Date(r.joined_at))}</td>
                    <td className="px-3 py-2.5 text-ink-2">{r.left_at ? `${fmtTime(new Date(r.left_at))}${r.reason === "removed" ? " (removed)" : ""}` : <Badge tone="good">Still here</Badge>}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{fmtDur(r.duration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editing && (
        <Modal title="Edit meeting" onClose={() => setEditing(false)}>
          <ScheduleForm
            meeting={m}
            onDone={(next) => {
              setEditing(false);
              setData({ ...data, meeting: next as ApiMeeting });
            }}
          />
        </Modal>
      )}
      {confirm && (
        <Modal title="Delete this meeting?" onClose={() => setConfirm(false)}>
          <p className="text-sm text-ink-2">The invite link stops working. This can&apos;t be undone.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                await call(`/api/meetings/${m.id}`, "DELETE");
                router.push("/app");
              }}
            >
              <Trash2 size={15} /> Delete meeting
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

