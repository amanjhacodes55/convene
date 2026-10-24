// Small toolkit for recording scripted browser demos: a visible cursor that glides between targets,
// human-ish typing, and Chrome's screencast turned into constant-frame-rate video with ffmpeg.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright-core");

export const BASE = process.env.BASE || "http://localhost:3021";
export const VIEW = { width: 1536, height: 864 }; // x1.25 device scale = 1920x1080 frames
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cursor drawn in the page: headless Chrome has no visible pointer of its own.
const CURSOR = `(() => {
  if (window.top !== window) return;
  const add = () => {
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 3l14 8.2-6.3 1.4L9.6 19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    c.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(var(--x,-40px),var(--y,-40px));filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))";
    const r = document.createElement("div");
    r.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(97,97,255,.35);opacity:0;transform:scale(.3);transition:transform .35s ease-out,opacity .45s ease-out";
    document.documentElement.append(c, r);
    const p = JSON.parse(sessionStorage.getItem("__cur") || "null");
    if (p) { c.style.setProperty("--x", p.x - 4 + "px"); c.style.setProperty("--y", p.y - 2 + "px"); }
    addEventListener("mousemove", (e) => {
      c.style.setProperty("--x", e.clientX - 4 + "px");
      c.style.setProperty("--y", e.clientY - 2 + "px");
      try { sessionStorage.setItem("__cur", JSON.stringify({ x: e.clientX, y: e.clientY })); } catch {}
    }, true);
    addEventListener("mousedown", (e) => {
      r.style.transition = "none"; r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
      r.style.opacity = "1"; r.style.transform = "scale(.3)"; r.offsetWidth;
      r.style.transition = ""; r.style.opacity = "0"; r.style.transform = "scale(1.4)";
    }, true);
  };
  if (document.documentElement) add(); else addEventListener("DOMContentLoaded", add);
  addEventListener("DOMContentLoaded", add);
})()`;

export async function launch() {
  return chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: [
      "--hide-scrollbars",
      "--font-render-hinting=none",
      // Media permission prompts accepted, audio allowed to start, and every participant's page kept
      // running at full speed while it is not the one being filmed.
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
  });
}

export async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1.25, colorScheme: "light", ...opts });
  await ctx.addInitScript(CURSOR);
  return ctx;
}

/** Pointer helpers bound to one page; remembers where the cursor is so moves are continuous. */
export function pointer(page) {
  let x = VIEW.width * 0.6, y = VIEW.height * 0.55;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const self = {
    async moveTo(tx, ty, ms) {
      const dist = Math.hypot(tx - x, ty - y);
      ms ??= Math.min(1100, 350 + dist * 0.9);
      const steps = Math.max(2, Math.round(ms / 16));
      const sx = x, sy = y;
      // A slight arc reads as a hand, not a robot.
      const bow = Math.min(60, dist * 0.08);
      for (let i = 1; i <= steps; i++) {
        const t = ease(i / steps);
        const off = Math.sin(Math.PI * t) * bow;
        await page.mouse.move(sx + (tx - sx) * t + off * 0.3, sy + (ty - sy) * t - off);
        await sleep(ms / steps);
      }
      x = tx; y = ty;
    },
    async hover(locator, { dx = 0.5, dy = 0.5, ms } = {}) {
      const loc = typeof locator === "string" ? page.locator(locator).first() : locator;
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      if (!b) throw new Error(`no box for ${locator}`);
      await self.moveTo(b.x + b.width * dx, b.y + b.height * dy, ms);
    },
    async click(locator, opts) {
      await self.hover(locator, opts);
      await sleep(140);
      await page.mouse.down();
      await sleep(70);
      await page.mouse.up();
      await sleep(250);
    },
    async type(text, { cps = 17 } = {}) {
      for (const ch of text) {
        await page.keyboard.type(ch);
        const base = 1000 / cps;
        await sleep(base * (0.55 + Math.random() * 0.9) + (ch === " " ? 25 : 0) + (/[,.!?]/.test(ch) ? 140 : 0));
      }
    },
    // Eased scroll run inside the page (wheel events are too coarse to look smooth). Scrolls the
    // window, or the nearest scrollable element under the cursor when the window can't scroll.
    async scroll(dy, ms = 1200) {
      await page.evaluate(({ dy, ms, x, y }) => new Promise((done) => {
        let el = document.elementFromPoint(x, y);
        while (el && !(el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
        const target = el || document.scrollingElement;
        const from = target.scrollTop, t0 = performance.now();
        const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        const step = (now) => {
          const t = Math.min(1, (now - t0) / ms);
          target.scrollTop = from + dy * ease(t);
          if (t < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }), { dy, ms, x, y });
    },
    get pos() { return { x, y }; },
    set pos(p) { x = p.x; y = p.y; },
  };
  return self;
}

/** Records a page through the DevTools screencast. stop() writes a constant-30fps mp4. */
export async function startRecording(page) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const t0 = Date.now() / 1000;
  cdp.on("Page.screencastFrame", async (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp ?? Date.now() / 1000 });
    try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch {}
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  return {
    t0,
    async stop(out) {
      const tEnd = Date.now() / 1000;
      await cdp.send("Page.stopScreencast").catch(() => {});
      await cdp.detach().catch(() => {});
      const dir = out.replace(/\.mp4$/, "_frames");
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      if (!frames.length) throw new Error("no frames captured");
      // First frame covers the gap from start; each frame lasts until the next one arrived.
      let list = "";
      frames.forEach((f, i) => {
        const file = path.join(dir, `${String(i).padStart(5, "0")}.jpg`);
        fs.writeFileSync(file, Buffer.from(f.data, "base64"));
        const next = i + 1 < frames.length ? frames[i + 1].t : tEnd;
        const start = i === 0 ? t0 : f.t;
        list += `file '${file}'\nduration ${Math.max(0.001, next - start).toFixed(4)}\n`;
      });
      list += `file '${path.join(dir, `${String(frames.length - 1).padStart(5, "0")}.jpg`)}'\n`;
      fs.writeFileSync(path.join(dir, "list.txt"), list);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"),
        "-vf", "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "16", out]);
      fs.rmSync(dir, { recursive: true, force: true });
      return tEnd - t0;
    },
  };
}
