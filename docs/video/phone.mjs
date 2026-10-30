// Small toolkit for recording an Android app on an emulator: find views with uiautomator, tap and type
// through adb, and film each beat with `screenrecord`. Taps show as touch dots (show_touches).
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";

export const ADB = process.env.ADB || `${process.env.HOME}/Android/Sdk/platform-tools/adb`;
export const SERIAL = process.env.SERIAL || "emulator-5580";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const adb = (...args) => execFileSync(ADB, ["-s", SERIAL, ...args], { maxBuffer: 64 << 20 }).toString();
export const shell = (cmd) => adb("shell", cmd);

/** Every node on screen, with its text, description, resource id and bounds. */
export function nodes() {
  for (let i = 0; i < 3; i++) {
    try {
      shell("uiautomator dump /sdcard/ui.xml >/dev/null 2>&1");
      const xml = shell("cat /sdcard/ui.xml");
      return [...xml.matchAll(/<node [^>]*>/g)].map(([n]) => {
        const attr = (k) => n.match(new RegExp(` ${k}="([^"]*)"`))?.[1] ?? "";
        const [x1, y1, x2, y2] = attr("bounds").match(/\d+/g).map(Number);
        const un = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
        return { text: un(attr("text")), desc: un(attr("content-desc")), id: attr("resource-id"), cls: attr("class"), clickable: attr("clickable") === "true", x: (x1 + x2) / 2, y: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1 };
      });
    } catch {
      // uiautomator fails while the screen is animating; try again.
    }
  }
  return [];
}

/** Waits for a node whose text or description matches, and returns it. */
export async function find(match, { timeout = 15000, exact = false, last = false } = {}) {
  const test = (s) => (typeof match === "string" ? (exact ? s === match : s.includes(match)) : match.test(s));
  const t0 = Date.now();
  for (;;) {
    const hit = nodes().filter((n) => n.w > 0 && n.h > 0 && (test(n.text) || test(n.desc) || test(n.id)));
    if (hit.length) return last ? hit[hit.length - 1] : hit[0];
    if (Date.now() - t0 > timeout) throw new Error(`not on screen: ${match}`);
    await sleep(400);
  }
}

export const tapAt = (x, y) => shell(`input tap ${Math.round(x)} ${Math.round(y)}`);
export async function tap(match, opts) {
  const n = await find(match, opts);
  tapAt(n.x, n.y);
  await sleep(500);
  return n;
}

/** Types like a person: a word at a time (adb input text needs spaces escaped). */
export async function type(text, { wpm = 160 } = {}) {
  const words = text.split(" ");
  for (const [i, w] of words.entries()) {
    const chunk = (i < words.length - 1 ? `${w} ` : w).replace(/([\\'"`$&|;<>()?*!#])/g, "\\$1").replace(/ /g, "%s");
    if (chunk) shell(`input text ${chunk}`);
    await sleep(60000 / wpm);
  }
}

export const key = (k) => shell(`input keyevent ${k}`);
export const back = () => key("KEYCODE_BACK");
export const hideKeyboard = () => key("KEYCODE_ESCAPE");

export async function swipe(x1, y1, x2, y2, ms = 400) {
  shell(`input swipe ${x1} ${y1} ${x2} ${y2} ${ms}`);
  await sleep(ms + 200);
}

/** Starts screenrecord on the device; stop() pulls the file to `out`. */
export function record(out) {
  const remote = `/sdcard/beat-${Date.now()}.mp4`;
  const proc = spawn(ADB, ["-s", SERIAL, "shell", "screenrecord", "--bit-rate", "12000000", remote], { stdio: "ignore" });
  const t0 = Date.now();
  return {
    t0,
    async stop() {
      const seconds = (Date.now() - t0) / 1000;
      // SIGINT makes screenrecord finish the file properly.
      try {
        shell("pkill -INT screenrecord");
      } catch {}
      await new Promise((r) => proc.on("exit", r));
      await sleep(800);
      adb("pull", remote, out);
      shell(`rm ${remote}`);
      if (!fs.existsSync(out)) throw new Error("no recording pulled");
      return seconds;
    },
  };
}
