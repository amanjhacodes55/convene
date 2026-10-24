"use client";

import { Hand, MicOff, Pin, PinOff, Radio } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Reaction } from "@/client/meeting";
import { Avatar } from "./ui";

export type TileProps = {
  id: string;
  name: string;
  stream: MediaStream | null;
  showVideo: boolean;
  mirror?: boolean;
  /** The screen-share tile: contain the picture instead of cropping it. */
  screen?: boolean;
  micMuted?: boolean;
  hand?: boolean;
  host?: boolean;
  recording?: boolean;
  speaking?: boolean;
  status?: string;
  quality?: number;
  pinned?: boolean;
  onPin?: () => void;
  reactions?: Reaction[];
  size?: "lg" | "md" | "sm";
  videoRef?: (el: HTMLVideoElement | null) => void;
};

export function Tile(p: TileProps) {
  const video = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = video.current;
    if (v && v.srcObject !== p.stream) v.srcObject = p.stream;
  }, [p.stream, p.showVideo]);

  const avatar = p.size === "sm" ? 44 : p.size === "lg" ? 112 : 72;
  return (
    <div
      className="group relative h-full w-full overflow-hidden rounded-2xl bg-tile"
      style={{ boxShadow: p.speaking ? "inset 0 0 0 3px var(--speaking)" : undefined, transition: "box-shadow .2s" }}
      data-tile={p.id}
    >
      <div className="absolute inset-0 grid place-items-center">
        <Avatar name={p.name} size={avatar} />
      </div>
      <video
        ref={(el) => {
          video.current = el;
          p.videoRef?.(el);
        }}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full ${p.screen ? "bg-black object-contain" : "object-cover"} ${p.mirror ? "mirror" : ""} ${p.showVideo ? "" : "invisible"}`}
      />

      {p.status && (
        <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-ink-2">{p.status}</span>
      )}

      <div className="absolute right-2 top-2 flex items-center gap-1.5">
        {p.recording && (
          <span className="flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-danger" title="Recording">
            <Radio size={12} /> REC
          </span>
        )}
        {p.hand && (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-warn text-black" title="Hand raised">
            <Hand size={15} />
          </span>
        )}
        {p.onPin && (
          <button
            className="grid h-7 w-7 place-items-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            onClick={p.onPin}
            aria-label={p.pinned ? `Unpin ${p.name}` : `Pin ${p.name}`}
          >
            {p.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
        )}
      </div>

      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 text-sm backdrop-blur-sm">
        {p.micMuted && <MicOff size={14} className="shrink-0 text-danger" aria-label="Muted" />}
        <span className="truncate">{p.name}</span>
        {p.host && <span className="rounded bg-white/15 px-1 text-[10px] uppercase tracking-wide text-ink-2">Host</span>}
        {p.quality ? <Bars level={p.quality} /> : null}
      </div>

      <div className="pointer-events-none absolute bottom-10 left-1/2 h-0 w-0">
        {p.reactions?.map((r, i) => (
          <span key={r.id} className="reaction absolute text-4xl" style={{ left: ((i % 3) - 1) * 26 - 18 }}>
            {r.emoji}
          </span>
        ))}
      </div>
    </div>
  );
}

function Bars({ level }: { level: number }) {
  const color = level >= 3 ? "var(--good)" : level === 2 ? "var(--warn)" : "var(--danger)";
  return (
    <span className="ml-0.5 flex items-end gap-[2px]" title={["", "Poor connection", "Fair connection", "Good connection"][level]}>
      {[1, 2, 3].map((b) => (
        <span key={b} className="w-[3px] rounded-sm" style={{ height: 3 + b * 3, background: b <= level ? color : "rgba(255,255,255,.25)" }} />
      ))}
    </span>
  );
}
