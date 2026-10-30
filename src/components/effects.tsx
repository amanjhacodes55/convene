"use client";

import { Ban, ImagePlus, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BACKGROUNDS, BackgroundEffect, saveImage, savedImage, thumbnail, type Effect } from "@/client/effects";

/** Off, two blurs, the built-in pictures and your own, as in Google Meet's "Backgrounds and effects". */
export function EffectPicker({ value, onPick }: { value: Effect; onPick: (e: Effect) => void }) {
  const [thumbs] = useState<Record<string, string>>(() => Object.fromEntries(BACKGROUNDS.map((b) => [b.id, thumbnail(b.id)])));
  const [own, setOwn] = useState(savedImage);
  const file = useRef<HTMLInputElement>(null);
  const upload = () => file.current?.click();

  const option = (effect: Effect, label: string, face: ReactNode, id: string) => (
    <button
      key={effect}
      className={`relative aspect-video overflow-hidden rounded-xl border-2 bg-raise transition-colors ${value === effect ? "border-accent" : "border-transparent hover:border-line"}`}
      onClick={() => (effect === "bg:custom" && !own ? upload() : onPick(effect))}
      aria-label={label}
      aria-pressed={value === effect}
      title={label}
      id={id}
    >
      {face}
    </button>
  );
  const icon = (i: ReactNode, text: string) => (
    <span className="grid h-full place-items-center content-center gap-1 text-[11px] text-ink-2">
      {i}
      {text}
    </span>
  );
  // Data URLs made on this device: next/image has nothing to optimize.
  // eslint-disable-next-line @next/next/no-img-element
  const picture = (src: string | undefined) => (src ? <img src={src} alt="" className="h-full w-full object-cover" /> : null);

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Blur</p>
        <div className="grid grid-cols-3 gap-2">
          {option("none", "No effect", icon(<Ban size={18} />, "Off"), "fx-none")}
          {option("blur-light", "Slightly blur your background", icon(<Sparkles size={16} />, "Slight blur"), "fx-blur-light")}
          {option("blur", "Blur your background", icon(<Sparkles size={20} />, "Blur"), "fx-blur")}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Backgrounds</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {option(
            "bg:custom",
            own ? "Your picture" : "Upload a picture",
            own ? picture(own) : icon(<ImagePlus size={18} />, "Upload"),
            "fx-upload",
          )}
          {BACKGROUNDS.map((b) => option(`bg:${b.id}`, b.name, picture(thumbs[b.id]), `fx-${b.id}`))}
        </div>
        {own && (
          <button className="mt-2 text-xs text-accent-ink hover:underline" onClick={upload}>
            Upload a different picture
          </button>
        )}
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setOwn(await saveImage(f));
          onPick("bg:custom");
        }}
        id="fx-file"
      />
      <p className="text-xs text-muted">Effects run on this device. Your video is never uploaded anywhere.</p>
    </div>
  );
}

/**
 * Shows a camera stream in `video` with an effect applied, for the lobby's preview. The meeting
 * applies its own copy when it starts, so this one goes away with the lobby.
 */
export function usePreviewEffect(videoRef: React.RefObject<HTMLVideoElement | null>, stream: MediaStream, effect: Effect, camOn: boolean, version: unknown) {
  useEffect(() => {
    const [track] = stream.getVideoTracks();
    const el = videoRef.current;
    if (!el || !track || !camOn || effect === "none") return;
    const fx = new BackgroundEffect(track, effect);
    el.srcObject = new MediaStream([fx.track]);
    return () => {
      fx.stop();
      el.srcObject = stream;
    };
  }, [videoRef, stream, effect, camOn, version]);
}
