"use client";

import { BarChart3, Bot, Crown, EyeOff, Hand, Link2, Lock, Mail, MessageSquare, MicOff, Phone, Plus, Send, Star, UserMinus, VideoOff, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { Meeting, MeetingState } from "@/client/meeting";
import { Avatar, colorFor } from "./ui";

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="flex h-full w-full flex-col rounded-2xl bg-panel sm:w-[340px]">
      <header className="flex items-center justify-between px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-raise" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>
          <X size={18} />
        </button>
      </header>
      {children}
    </aside>
  );
}

/** Text with links made clickable, without ever rendering HTML from a message. */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer noopener" className="break-all text-accent-ink underline underline-offset-2">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function ChatPanel({ meeting, state, to, setTo, onClose }: { meeting: Meeting; state: MeetingState; to: string; setTo: (id: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const { chat } = state.settings;
  const me = state.self;
  // Who this user may write to under the host's chat rules (hosts may always write to anyone).
  const allowed = me.host || chat === "everyone" ? state.remotes : chat === "host" ? state.remotes.filter((r) => r.host) : [];
  const canEveryone = me.host || chat === "everyone";
  const muted = !me.host && chat === "off";
  // A private recipient who has left, or isn't allowed, falls back to the first one allowed.
  const recipient = allowed.find((r) => r.id === to) ?? (canEveryone ? undefined : allowed[0]);
  const nameOf = (id: string) => state.remotes.find((r) => r.id === id)?.name ?? "someone who left";
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [state.chat.length]);

  return (
    <Panel title="Chat" onClose={onClose}>
      <div ref={list} className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 pb-3">
        {!state.chat.length && <p className="mt-6 text-center text-sm text-muted">Messages are only seen by people in the call and disappear when it ends.</p>}
        {state.chat.map((m, i) => {
          const mine = m.from === "self";
          const prev = state.chat[i - 1];
          const grouped = i > 0 && prev.from === m.from && prev.to === m.to && m.at - prev.at < 60_000;
          if (m.app) {
            return (
              <div key={m.id} className="rounded-xl border border-accent/30 bg-accent/10 p-3" data-app-message>
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <Bot size={14} className="text-accent-ink" />
                  <span className="font-semibold text-accent-ink">{m.name}</span>
                  <span className="rounded bg-accent/25 px-1 text-[10px] font-semibold uppercase tracking-wide text-accent-ink">App</span>
                  <span className="text-muted">{new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-ink">
                  <Linked text={m.text} />
                </p>
              </div>
            );
          }
          return (
            <div key={m.id} className={grouped ? "-mt-2.5" : ""}>
              {!grouped && (
                <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-semibold" style={{ color: mine ? "var(--accent-ink)" : colorFor(m.name) }}>
                    {mine ? "You" : m.name}
                  </span>
                  {m.to && <span className="text-warn">{mine ? `to ${nameOf(m.to)} (privately)` : "to you (privately)"}</span>}
                  <span className="text-muted">{new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                </div>
              )}
              <p className={`whitespace-pre-wrap break-words text-sm text-ink ${m.to ? "border-l-2 border-warn/60 pl-2" : ""}`}>
                <Linked text={m.text} />
              </p>
            </div>
          );
        })}
      </div>
      <form
        className="space-y-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          meeting.sendChat(text, recipient?.id);
          setText("");
        }}
      >
        <label className="flex items-center gap-2 text-xs text-ink-2">
          To:
          <select className={`h-7 rounded-lg border border-line bg-raise px-2 text-xs outline-none ${recipient ? "text-warn" : "text-ink"}`} value={recipient?.id ?? ""} onChange={(e) => setTo(e.target.value)} id="chat-to">
            {canEveryone && <option value="">Everyone</option>}
            {allowed.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} (privately)
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <input
            className="input h-11"
            placeholder={muted ? "The host has turned off chat" : recipient ? `Message ${recipient.name} privately` : "Message everyone"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            id="chat-input"
            disabled={muted || (!canEveryone && !recipient)}
          />
          <button className="btn btn-primary h-11 w-11 shrink-0 p-0" disabled={!text.trim() || muted} aria-label="Send">
            <Send size={17} />
          </button>
        </div>
      </form>
    </Panel>
  );
}

export function PeoplePanel({ meeting, state, onClose, onCopy, onMessage }: { meeting: Meeting; state: MeetingState; onClose: () => void; onCopy: () => void; onMessage: (id: string) => void }) {
  const host = state.self.host;
  const owner = host && !state.self.cohost;
  // With the list hidden, participants see only the hosts and themselves.
  const hidden = state.settings.hideList && !host;
  const people = [
    { ...state.self, id: "self", self: true, conn: "connected" },
    ...state.remotes.filter((r) => !hidden || r.host).map((r) => ({ ...r, self: false })),
  ].sort((a, b) => Number(b.hand) - Number(a.hand));
  const count = state.settings.hideCount && !host ? "" : ` (${state.remotes.length + 1})`;

  return (
    <Panel title={`People${count}`} onClose={onClose}>
      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-3">
        <button className="btn mx-2 mb-3 w-[calc(100%-1rem)]" onClick={onCopy}>
          <Link2 size={16} /> Copy invite link
        </button>

        {host && state.waiting.length > 0 && (
          <section className="mb-3 rounded-xl border border-warn/40 bg-warn/5 p-2">
            <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold uppercase tracking-wide text-warn">
              Waiting room ({state.waiting.length})
              {state.waiting.length > 1 && (
                <button className="text-xs normal-case text-accent-ink hover:underline" onClick={() => state.waiting.forEach((w) => meeting.admit(w.id))}>
                  Admit all
                </button>
              )}
            </div>
            {state.waiting.map((w) => (
              <div key={w.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                <Avatar name={w.name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{w.name}</span>
                  {w.email && <span className="block truncate text-xs text-muted">{w.email}</span>}
                </span>
                <button className="btn h-8 px-3 text-xs" onClick={() => meeting.deny(w.id)}>
                  Deny
                </button>
                <button className="btn btn-primary h-8 px-3 text-xs" onClick={() => meeting.admit(w.id)}>
                  Admit
                </button>
              </div>
            ))}
          </section>
        )}

        <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">In the meeting</div>
        {hidden && (
          <p className="mx-2 mb-2 flex items-center gap-2 rounded-lg bg-raise px-3 py-2 text-xs text-ink-2">
            <EyeOff size={14} /> The host has hidden the participant list.
          </p>
        )}
        {people.map((p) => (
          <div key={p.id} className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-raise">
            <Avatar name={p.name} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">
                {p.name}
                {p.self && <span className="text-muted"> (you)</span>}
              </div>
              <div className="text-xs text-muted">{[p.host && (p.cohost ? "Co-host" : "Host"), !p.self && p.conn !== "connected" && "Connecting…"].filter(Boolean).join(" · ")}</div>
              {host && !p.self && (p.email || p.phone) && (
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-2" data-contact>
                  {p.email && (
                    <span className="flex items-center gap-1">
                      <Mail size={11} /> {p.email}
                    </span>
                  )}
                  {p.phone && (
                    <span className="flex items-center gap-1">
                      <Phone size={11} /> {p.phone}
                    </span>
                  )}
                </div>
              )}
            </div>
            {owner && !p.self && (!p.host || p.cohost) && (
              <button
                className={`grid h-7 w-7 place-items-center rounded-full hover:bg-raise group-hover:opacity-100 ${p.cohost ? "text-warn" : "text-muted opacity-0 hover:text-ink"}`}
                onClick={() => meeting.makeCohost(p.id, !p.cohost)}
                aria-label={p.cohost ? `Remove ${p.name} as co-host` : `Make ${p.name} a co-host`}
                title={p.cohost ? "Remove co-host" : "Make co-host"}
              >
                <Crown size={14} />
              </button>
            )}
            {p.hand && (
              <button
                className="text-warn"
                title={host && !p.self ? "Lower hand" : "Hand raised"}
                onClick={() => host && !p.self && meeting.lowerHand(p.id)}
                aria-label="Hand raised"
              >
                <Hand size={16} />
              </button>
            )}
            {state.spotlight === p.id && <Star size={15} className="text-accent-ink" fill="currentColor" aria-label="Spotlighted" />}
            {!p.self && (
              <button className="grid h-7 w-7 place-items-center rounded-full text-muted opacity-0 hover:bg-raise hover:text-ink group-hover:opacity-100" onClick={() => onMessage(p.id)} aria-label={`Message ${p.name} privately`} title="Message privately">
                <MessageSquare size={14} />
              </button>
            )}
            {host && (
              <button
                className={`grid h-7 w-7 place-items-center rounded-full hover:bg-raise group-hover:opacity-100 ${state.spotlight === p.id ? "hidden" : "text-muted opacity-0 hover:text-ink"}`}
                onClick={() => meeting.setSpotlight(p.id)}
                aria-label={`Spotlight ${p.name}`}
                title="Spotlight for everyone"
              >
                <Star size={14} />
              </button>
            )}
            {p.camOff && <VideoOff size={16} className="text-muted" aria-label="Camera off" />}
            {p.muted ? (
              <MicOff size={16} className="text-danger" aria-label="Muted" />
            ) : (
              host &&
              !p.self && (
                <button className="text-xs text-accent-ink opacity-0 hover:underline group-hover:opacity-100" onClick={() => meeting.muteParticipant(p.id)}>
                  Mute
                </button>
              )
            )}
            {host && !p.self && (
              <button
                className="grid h-7 w-7 place-items-center rounded-full text-muted opacity-0 hover:bg-danger/20 hover:text-danger group-hover:opacity-100"
                onClick={() => meeting.remove(p.id)}
                aria-label={`Remove ${p.name}`}
                title="Remove from meeting"
              >
                <UserMinus size={15} />
              </button>
            )}
          </div>
        ))}
      </div>

      {host && (
        <footer className="space-y-2 border-t border-line p-4">
          <button className="btn w-full" onClick={meeting.muteAll}>
            <MicOff size={16} /> Mute everyone
          </button>
          <Toggle label="Waiting room" hint="New people wait until you admit them" checked={state.settings.waitingRoom} onChange={(v) => meeting.updateSettings({ waitingRoom: v })} />
          <Toggle
            label={
              <span className="flex items-center gap-1.5">
                <Lock size={13} /> Lock meeting
              </span>
            }
            hint="Nobody new can join"
            checked={state.settings.locked}
            onChange={(v) => meeting.updateSettings({ locked: v })}
          />
        </footer>
      )}
    </Panel>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: ReactNode; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{ background: checked ? "var(--accent)" : "var(--raise)" }}
      >
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: checked ? 22 : 2 }} />
      </button>
    </label>
  );
}

export function PollsPanel({ meeting, state, onClose }: { meeting: Meeting; state: MeetingState; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const host = state.self.host;
  return (
    <Panel title="Polls" onClose={onClose}>
      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {!state.polls.length && !host && <p className="mt-6 text-center text-sm text-muted">When the host starts a poll, it shows up here.</p>}
        {[...state.polls].reverse().map((p) => {
          const total = p.counts.reduce((a, b) => a + b, 0);
          const showResults = p.mine || p.closed;
          return (
            <section key={p.id} className="rounded-xl border border-line p-3" data-poll={p.id}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold">{p.question}</h3>
                {p.closed ? <span className="shrink-0 rounded bg-raise px-1.5 text-[10px] uppercase text-muted">Ended</span> : <span className="shrink-0 rounded bg-good/15 px-1.5 text-[10px] uppercase text-good">Live</span>}
              </div>
              <div className="mt-2 space-y-1.5">
                {p.options.map((o, i) => {
                  const pct = total ? Math.round((p.counts[i] / total) * 100) : 0;
                  return (
                    <button
                      key={i}
                      disabled={p.closed}
                      onClick={() => meeting.vote(p.id, i)}
                      className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors ${p.voted === i ? "border-accent" : "border-line hover:border-accent/50"}`}
                    >
                      {showResults && <span className="absolute inset-y-0 left-0 bg-accent/20 transition-all" style={{ width: `${pct}%` }} />}
                      <span className="relative flex justify-between gap-2">
                        <span>{o}</span>
                        {showResults && (
                          <span className="tabular-nums text-ink-2">
                            {pct}% · {p.counts[i]}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted">
                <span>{showResults ? `${total} vote${total === 1 ? "" : "s"}` : p.voted !== null ? "Vote sent. Results appear when the poll ends." : "Choose one"}</span>
                {p.mine && !p.closed && (
                  <button className="btn h-7 px-3 text-xs" onClick={() => meeting.closePoll(p.id)} id="poll-end">
                    End poll and share results
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {host && (
        <form
          className="space-y-2 border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            meeting.createPoll(question, options);
            setQuestion("");
            setOptions(["", ""]);
          }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <BarChart3 size={14} /> New poll
          </div>
          <input className="input h-10 text-sm" placeholder="Ask a question" value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} id="poll-question" />
          {options.map((o, i) => (
            <input
              key={i}
              className="input h-9 text-sm"
              placeholder={`Option ${i + 1}`}
              value={o}
              maxLength={120}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
              data-poll-option={i}
            />
          ))}
          <div className="flex gap-2">
            {options.length < 6 && (
              <button type="button" className="btn h-9 text-xs" onClick={() => setOptions([...options, ""])}>
                <Plus size={14} /> Option
              </button>
            )}
            <button className="btn btn-primary h-9 flex-1 text-sm" disabled={!question.trim() || options.filter((o) => o.trim()).length < 2} id="poll-launch">
              Launch poll
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}
