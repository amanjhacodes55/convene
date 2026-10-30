// Background effects, as in Google Meet: blur what's behind you, or replace it with a picture.
// MediaPipe's selfie segmenter finds the person in each camera frame, in the browser; the frame is
// redrawn on a canvas with the background swapped, and the canvas becomes the camera track that
// is sent and shown. Nothing leaves the device.
//
// Until the model has loaded (a few seconds the first time), the whole frame gets the background
// treatment, so picking "Blur" never shows the room, even for a moment.

import type { ImageSegmenter } from "@mediapipe/tasks-vision";

/** "none", a blur, or `bg:<id>` for one of BACKGROUNDS or "bg:custom" for an uploaded picture. */
export type Effect = "none" | "blur-light" | "blur" | `bg:${string}`;

// The wasm runtime is pinned to the installed package version; the model is Google's hosted one.
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

const EFFECT_KEY = "convene:effect";
const IMAGE_KEY = "convene:effect-image";

export function savedEffect(): Effect {
  try {
    const e = localStorage.getItem(EFFECT_KEY) ?? "none";
    if (e === "bg:custom" && !localStorage.getItem(IMAGE_KEY)) return "none";
    return e === "blur-light" || e === "blur" || e.startsWith("bg:") ? (e as Effect) : "none";
  } catch {
    return "none";
  }
}
export function saveEffect(e: Effect) {
  try {
    localStorage.setItem(EFFECT_KEY, e);
  } catch {}
}
export function savedImage() {
  try {
    return localStorage.getItem(IMAGE_KEY);
  } catch {
    return null;
  }
}

/** Shrinks an uploaded picture to at most 1280×720 and keeps it here, so it survives a reload. */
export async function saveImage(file: File) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / img.width, 720 / img.height);
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.85);
  try {
    localStorage.setItem(IMAGE_KEY, url);
  } catch {
    // Storage full: the picture still works until the page closes.
  }
  customUrl = url;
  customImage = null;
  return url;
}
let customUrl: string | null = null;
let customImage: HTMLImageElement | null = null;
function custom() {
  const url = customUrl ?? savedImage();
  if (!url) return null;
  if (!customImage || customImage.src !== url) {
    customImage = new Image();
    customImage.src = url;
  }
  return customImage.complete && customImage.naturalWidth ? customImage : null;
}

// ---- pictures ------------------------------------------------------------------------------------
// Painted rather than downloaded: no image files to ship or license, and they suit any resolution.

type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const vertical = (ctx: CanvasRenderingContext2D, h: number, stops: string[]) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
};
/** A filled silhouette of rolling hills across the bottom of the picture. */
const hills = (ctx: CanvasRenderingContext2D, w: number, h: number, base: number, amp: number, waves: number, phase: number, color: string) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += w / 60) ctx.lineTo(x, h * base - Math.sin((x / w) * Math.PI * waves + phase) * h * amp - Math.sin((x / w) * Math.PI * waves * 2.7 + phase * 3) * h * amp * 0.35);
  ctx.lineTo(w, h);
  ctx.fill();
};
/** Soft out-of-focus lights. */
const bokeh = (ctx: CanvasRenderingContext2D, w: number, h: number, colors: string[], n: number) => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = (0.03 + rnd() * 0.09) * w;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colors[i % colors.length]);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
};

export const BACKGROUNDS: { id: string; name: string; paint: Paint }[] = [
  {
    id: "studio",
    name: "Studio",
    paint: (ctx, w, h) => {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, w * 0.75);
      g.addColorStop(0, "#6b7080");
      g.addColorStop(0.55, "#3a3e4a");
      g.addColorStop(1, "#15171c");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  },
  {
    id: "dusk",
    name: "Dusk",
    paint: (ctx, w, h) => {
      ctx.fillStyle = vertical(ctx, h, ["#24124a", "#7a2d73", "#e0607e", "#f9b16e"]);
      ctx.fillRect(0, 0, w, h);
      const sun = ctx.createRadialGradient(w * 0.68, h * 0.62, 0, w * 0.68, h * 0.62, h * 0.22);
      sun.addColorStop(0, "#fff1c9");
      sun.addColorStop(0.45, "#ffd38a");
      sun.addColorStop(1, "transparent");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, h);
      hills(ctx, w, h, 0.74, 0.05, 2, 0.6, "#5b2a5e");
      hills(ctx, w, h, 0.84, 0.04, 3, 2.1, "#3b1b45");
      hills(ctx, w, h, 0.93, 0.03, 4, 4.0, "#22102c");
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    paint: (ctx, w, h) => {
      ctx.fillStyle = vertical(ctx, h * 0.62, ["#7cc4f2", "#cde9f7", "#f4f1e4"]);
      ctx.fillRect(0, 0, w, h * 0.62);
      ctx.fillStyle = vertical(ctx, h, ["#2f86b8", "#1d5f8c", "#123f63"]);
      ctx.fillRect(0, h * 0.62, w, h * 0.38);
      ctx.fillStyle = "rgba(255,255,255,.35)";
      for (let i = 0; i < 14; i++) ctx.fillRect(((i * 0.37) % 1) * w, h * (0.65 + (i % 7) * 0.045), w * 0.08, h * 0.004);
    },
  },
  {
    id: "forest",
    name: "Forest",
    paint: (ctx, w, h) => {
      ctx.fillStyle = vertical(ctx, h, ["#dfeee0", "#a9cfae", "#5f9a6e"]);
      ctx.fillRect(0, 0, w, h);
      hills(ctx, w, h, 0.62, 0.06, 2, 1.2, "rgba(79,134,97,.75)");
      hills(ctx, w, h, 0.74, 0.05, 3, 0.2, "rgba(52,104,72,.9)");
      hills(ctx, w, h, 0.86, 0.04, 5, 2.4, "#24533a");
      hills(ctx, w, h, 0.96, 0.03, 6, 5.1, "#163826");
    },
  },
  {
    id: "aurora",
    name: "Aurora",
    paint: (ctx, w, h) => {
      ctx.fillStyle = vertical(ctx, h, ["#050a1f", "#0c1b3a", "#0b2a3a"]);
      ctx.fillRect(0, 0, w, h);
      for (const [x, y, r, c] of [
        [0.25, 0.3, 0.45, "rgba(62,207,142,.45)"],
        [0.6, 0.22, 0.4, "rgba(109,124,255,.4)"],
        [0.85, 0.4, 0.35, "rgba(143,109,255,.35)"],
      ] as const) {
        const g = ctx.createRadialGradient(w * x, h * y, 0, w * x, h * y, w * r);
        g.addColorStop(0, c);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      hills(ctx, w, h, 0.9, 0.04, 3, 1, "#03060f");
    },
  },
  {
    id: "lights",
    name: "City lights",
    paint: (ctx, w, h) => {
      ctx.fillStyle = vertical(ctx, h, ["#1b1530", "#2b1f45", "#3d2a4f"]);
      ctx.fillRect(0, 0, w, h);
      bokeh(ctx, w, h, ["rgba(255,196,110,.55)", "rgba(255,120,140,.4)", "rgba(140,170,255,.45)", "rgba(255,230,180,.5)"], 26);
    },
  },
];

/** A small picture of an effect for the picker. */
export function thumbnail(id: string, w = 160, h = 90) {
  const bg = BACKGROUNDS.find((b) => b.id === id);
  if (!bg) return "";
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  bg.paint(c.getContext("2d")!, w, h);
  return c.toDataURL();
}

// ---- the segmenter -------------------------------------------------------------------------------

let segmenter: Promise<ImageSegmenter | null> | null = null;
/** Loads once for the page; null where it can't run (no WebAssembly, offline). */
function loadSegmenter() {
  segmenter ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        return await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: "VIDEO",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
      } catch {
        // No WebGL here: try the CPU.
      }
    }
    return null;
  })().catch((e) => {
    console.warn("convene: background effects unavailable", e);
    return null;
  });
  return segmenter;
}
// MediaPipe needs increasing timestamps across every caller on the page.
let lastStamp = 0;
const stamp = () => (lastStamp = Math.max(lastStamp + 1, Math.round(performance.now())));

/**
 * A frame clock that keeps going in a background tab, where timers in the page slow to once a
 * second: a worker's timer isn't throttled the same way. Falls back to a page timer.
 */
function ticker(fps: number, tick: () => void) {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${Math.round(1000 / fps)})`], { type: "text/javascript" }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = tick;
    return () => worker.terminate();
  } catch {
    const t = setInterval(tick, 1000 / fps);
    return () => clearInterval(t);
  }
}

// ---- the processor -------------------------------------------------------------------------------

/** Turns a camera track into one with the background blurred or replaced. */
export class BackgroundEffect {
  readonly track: MediaStreamTrack;
  private video = document.createElement("video");
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  /** The person, as an alpha mask the size of the model's output. */
  private mask = document.createElement("canvas");
  private maskCtx = this.mask.getContext("2d")!;
  private maskData: ImageData | null = null;
  private hasMask = false;
  /** For blurring where the canvas has no `filter` (Safari): shrink, then stretch back. */
  private small = document.createElement("canvas");
  private picture: { key: string; canvas: HTMLCanvasElement } | null = null;
  private seg: ImageSegmenter | null = null;
  private filters: boolean;
  private stopTicker: () => void;
  private stopped = false;

  constructor(
    source: MediaStreamTrack,
    private mode: Effect,
  ) {
    this.video.muted = true;
    this.video.playsInline = true;
    this.setSource(source);
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.ctx.filter = "blur(1px)";
    this.filters = this.ctx.filter === "blur(1px)";
    this.ctx.filter = "none";
    this.track = this.canvas.captureStream(30).getVideoTracks()[0];
    this.track.contentHint = "motion";
    void loadSegmenter().then((s) => (this.seg = s));
    this.stopTicker = ticker(30, () => this.draw());
  }

  setSource(track: MediaStreamTrack) {
    this.video.srcObject = new MediaStream([track]);
    void this.video.play().catch(() => {});
  }

  setMode(mode: Effect) {
    this.mode = mode;
  }

  stop() {
    this.stopped = true;
    this.stopTicker();
    this.track.stop();
    this.video.srcObject = null;
  }

  private draw() {
    const v = this.video;
    if (this.stopped || v.readyState < 2 || !v.videoWidth) return;
    // At most 720p: segmenting and compositing every frame is the expensive part.
    const scale = Math.min(1, 1280 / v.videoWidth, 720 / v.videoHeight);
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const { ctx } = this;
    if (this.mode === "none") {
      ctx.drawImage(v, 0, 0, w, h);
      return;
    }
    if (this.seg) {
      try {
        this.seg.segmentForVideo(v, stamp(), (result) => {
          const m = result.confidenceMasks?.[0];
          if (!m) return;
          if (this.mask.width !== m.width || this.mask.height !== m.height || !this.maskData) {
            this.mask.width = m.width;
            this.mask.height = m.height;
            this.maskData = new ImageData(m.width, m.height);
          }
          const conf = m.getAsFloat32Array();
          const px = this.maskData.data;
          for (let i = 0; i < conf.length; i++) px[i * 4 + 3] = conf[i] * 255;
          this.maskCtx.putImageData(this.maskData, 0, 0);
          this.hasMask = true;
        });
      } catch (e) {
        console.warn("convene: segmentation failed", e);
        this.seg = null;
      }
    }

    if (!this.hasMask) {
      // Not ready yet: hide everything rather than show the room.
      this.background(v, w, h);
      return;
    }
    // The person: the mask (feathered), then the frame drawn only where the mask is.
    ctx.globalCompositeOperation = "copy";
    if (this.filters) ctx.filter = `blur(${Math.max(1, Math.round(w / 400))}px)`;
    ctx.drawImage(this.mask, 0, 0, w, h);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-in";
    ctx.drawImage(v, 0, 0, w, h);
    // Then the new background behind them.
    ctx.globalCompositeOperation = "destination-over";
    this.background(v, w, h);
    ctx.globalCompositeOperation = "source-over";
  }

  private background(v: HTMLVideoElement, w: number, h: number) {
    const { ctx } = this;
    if (this.mode === "blur" || this.mode === "blur-light") {
      const px = (this.mode === "blur" ? 18 : 7) * (w / 1280);
      if (this.filters) {
        ctx.filter = `blur(${px}px)`;
        // Drawn a little larger, so the blur doesn't pull in transparent edges.
        ctx.drawImage(v, -px * 2, -px * 2, w + px * 4, h + px * 4);
        ctx.filter = "none";
      } else {
        const f = this.mode === "blur" ? 24 : 10;
        this.small.width = Math.max(1, Math.round(w / f));
        this.small.height = Math.max(1, Math.round(h / f));
        const s = this.small.getContext("2d")!;
        s.imageSmoothingQuality = "high";
        s.drawImage(v, 0, 0, this.small.width, this.small.height);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(this.small, 0, 0, w, h);
      }
      return;
    }
    const pic = this.pictureFor(w, h);
    if (pic) ctx.drawImage(pic, 0, 0, w, h);
    else {
      ctx.fillStyle = "#1a1e27";
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** The chosen picture at the frame's size, painted (or cropped to cover) once and reused. */
  private pictureFor(w: number, h: number) {
    const id = this.mode.slice(3);
    const img = id === "custom" ? custom() : null;
    const key = `${this.mode}:${w}x${h}:${img?.src.length ?? 0}`;
    if (this.picture?.key === key) return this.picture.canvas;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cx = c.getContext("2d")!;
    if (img) {
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      cx.drawImage(img, (w - img.naturalWidth * s) / 2, (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    } else {
      const bg = BACKGROUNDS.find((b) => b.id === id);
      if (!bg) return null;
      bg.paint(cx, w, h);
    }
    // The uploaded picture may still be decoding; don't keep a blank one.
    if (id !== "custom" || img) this.picture = { key, canvas: c };
    return c;
  }
}
