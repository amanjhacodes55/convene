// Records "Convene on Android": the native app on an emulator, joining a real meeting on the live site
// where three teammates are on laptops (headless browsers with virtual webcams, see persona.js).
// Each beat is filmed with screenrecord, set in a phone frame on a 1080p slide, and narrated.
//
//   1. Boot an emulator (SERIAL, default emulator-5580) with the app installed:
//        emulator -avd <avd> -port 5580 -no-window &   adb install android/app/build/outputs/apk/debug/app-debug.apk
//   2. node docs/video/phone-demo.mjs        (BASE defaults to the live site the app talks to)
//
// Output: docs/media/convene-android.mp4
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONAS } from "./personas.mjs";
import { back, find, hideKeyboard, nodes, record, shell, sleep, swipe, tap, tapAt, type } from "./phone.mjs";
import { launch, newContext } from "./rec.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(HERE, "build", "phone");
const MEDIA = path.join(HERE, "../media");
const BASE = process.env.BASE || "https://convene-meet.netlify.app";
const PKG = "org.convene.app";
const PYTHON = process.env.TTS_PYTHON || path.join(process.env.HOME, ".local/share/kokoro-tts/venv/bin/python");
const VOICE = process.env.VOICE || "af_heart";
const LEAD = 0.4, TAIL = 0.7;
fs.mkdirSync(path.join(BUILD, "voice"), { recursive: true });

const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
function voice(text) {
  const key = crypto.createHash("sha1").update(`${VOICE}\n${text}`).digest("hex").slice(0, 12);
  const file = path.join(BUILD, "voice", key + ".wav");
  if (!fs.existsSync(file)) execFileSync(PYTHON, [path.join(HERE, "tts.py"), file], { input: text, env: { ...process.env, VOICE }, stdio: ["pipe", "ignore", "inherit"] });
  return { file, seconds: probe(file) };
}

// ---------------------------------------------------------------------------------------------
// Setup, off camera: Leo's account (with one scheduled meeting), and Maya's meeting with teammates.

const stamp = Date.now();
const leo = { name: "Leo Park", email: `leo.park+${stamp}@acme.dev`, password: "a long passphrase" };
async function api(pathname, body, cookie) {
  const res = await fetch(BASE + pathname, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { json: await res.json(), cookie: res.headers.get("set-cookie")?.split(";")[0] ?? cookie };
}
const { cookie } = await api("/api/auth/signup", leo);
await api("/api/meetings", { topic: "Product sync", agenda: "Roadmap and launch dates", start_time: new Date(Date.now() + 26 * 3600_000).toISOString(), duration: 30, settings: { waiting_room: false } }, cookie);
await api("/api/meetings", { topic: "1:1 with Maya", start_time: new Date(Date.now() + 50 * 3600_000).toISOString(), duration: 30 }, cookie);

const PERSONA = fs.readFileSync(path.join(HERE, "persona.js"), "utf8");
const browser = await launch();
async function person(key) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(`window.__PERSONA__ = ${JSON.stringify(PERSONAS[key])};\n${PERSONA}`);
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  return page;
}
const maya = await person("maya");
await maya.goto(BASE);
await maya.fill("#title", "Design review");
await maya.click("#new-meeting");
await maya.waitForURL(/\/m\/[a-z-]+$/);
const code = maya.url().split("/m/")[1];
await maya.locator("#join:not([disabled])").waitFor();
await maya.fill("#name", "Maya Chen");
await maya.click("#join");
await maya.locator("#ctl-mic").waitFor();
const teammates = {};
for (const [key, name] of [["priya", "Priya Nair"], ["sam", "Sam Okafor"]]) {
  const p = await person(key);
  await p.goto(`${BASE}/m/${code}`);
  await p.locator("#join:not([disabled])").waitFor();
  await p.fill("#name", name);
  await p.click("#join");
  await p.locator("#ctl-mic").waitFor();
  teammates[key] = p;
}
const say = (page, ms) => page.evaluate((ms) => window.__persona.say(ms), ms);

// The phone: a fresh start, permissions granted (the system prompt isn't the story), touches shown.
shell(`pm clear ${PKG}`);
for (const perm of ["CAMERA", "RECORD_AUDIO", "POST_NOTIFICATIONS"]) {
  try {
    shell(`pm grant ${PKG} android.permission.${perm}`);
  } catch {}
}
shell("settings put system show_touches 1");
shell(`am start -n ${PKG}/.MainActivity`);
await find("New meeting", { timeout: 30000 });
await sleep(1500);

// ---------------------------------------------------------------------------------------------
// Beats: a headline for the slide, the line that is spoken, and what happens on the phone.

const beats = [
  { title: "Convene on Android", text: "Convene has a native Android app, so your team can join meetings from their phones, not just their laptops.", run: async () => {
    await sleep(3500);
  } },
  { title: "Join with a code", text: "Got a meeting code or an invite link? Paste it in, and tap Join.", run: async () => {
    await tap("abc-defg-hij or a link");
    await type(code, { wpm: 220 });
    await sleep(400);
    await hideKeyboard();
    await tap("Join", { exact: true });
    await find("Your name", { timeout: 30000 });
    await sleep(800);
  } },
  { title: "Check your camera", text: "The lobby shows your camera before you go in. Add your name, and join.", run: async () => {
    const field = (await find(/e\.g\. Maya Chen|Your name/)).y;
    const input = nodes().find((n) => n.cls.endsWith("EditText") && n.y > field - 10);
    if (input) tapAt(input.x, input.y);
    await sleep(300);
    await type("Leo Park", { wpm: 120 });
    await hideKeyboard();
    await sleep(300);
    await tap(/^Join now$/);
    await find("Mute", { timeout: 30000 }).catch(() => find("Microphone"));
    await sleep(1500);
  } },
  { title: "In the meeting", text: "And you're in, with everyone else on their laptops. Video goes straight between devices, encrypted.", run: async () => {
    await say(maya, 5000);
    await sleep(2500);
    await say(teammates.priya, 3000);
    await sleep(3000);
  } },
  { title: "Everything a tap away", text: "Mute and unmute, react, or raise your hand. Everything is a tap away, just like in Zoom.", run: async () => {
    await tap(/^(Mute|Microphone)/);
    await sleep(1200);
    await tap("More", { exact: true });
    await sleep(900);
    await tap("React 👏").catch(() => {});
    await sleep(1200);
    await tap("More", { exact: true });
    await sleep(700);
    await tap("Raise hand");
    await sleep(1500);
  } },
  { title: "Chat with the team", text: "Chat with the whole team, or message someone privately.", run: async () => {
    await teammates.priya.click("#ctl-chat");
    await teammates.priya.fill("#chat-input", "Leo, can you share the new screens after this?");
    await teammates.priya.keyboard.press("Enter");
    await sleep(800);
    await tap("Chat", { exact: true });
    await sleep(900);
    await tap(/Message everyone/);
    await type("Sure, sending them right after", { wpm: 150 });
    shell("input keyevent KEYCODE_ENTER");
    await sleep(600);
    await hideKeyboard();
    await sleep(1200);
  } },
  { title: "Leave when you're done", text: "Leave when you're done. The app asks first, so a stray tap won't drop you from the call.", run: async () => {
    await tap(/Close chat/).catch(() => {});
    await sleep(600);
    back();
    await find("Leave the meeting?");
    await sleep(1200);
    await tap("Leave", { exact: true, last: true });
    await find("New meeting", { timeout: 20000 });
    await sleep(800);
  } },
  { title: "Your meetings, on your phone", text: "Sign in, and your meetings come with you: everything you've scheduled, on the web or the app.", run: async () => {
    await tap("Sign in", { exact: true });
    await sleep(800);
    const fields = nodes().filter((n) => n.cls.endsWith("EditText"));
    tapAt(fields[0].x, fields[0].y);
    await type(leo.email, { wpm: 400 });
    tapAt(fields[1].x, fields[1].y);
    await type(leo.password, { wpm: 300 });
    await hideKeyboard();
    await sleep(300);
    await tap("Sign in", { exact: true, last: true });
    await find("Product sync", { timeout: 30000 });
    await sleep(1500);
  } },
  { title: "Share an invitation", text: "Share an invitation through any app on your phone, with the time, the link, and the meeting ID.", run: async () => {
    await tap("Share invitation");
    await sleep(2500);
    back();
    await sleep(800);
  } },
  { title: "Schedule on the go", text: "Schedule a new meeting in a few taps, with a time, a length, and an agenda.", run: async () => {
    await tap("Schedule", { exact: true });
    await find("Schedule a meeting");
    await sleep(800);
    const fields = nodes().filter((n) => n.cls.endsWith("EditText"));
    tapAt(fields[0].x, fields[0].y);
    await type("Launch checklist", { wpm: 150 });
    await hideKeyboard();
    await sleep(500);
    await swipe(540, 1700, 540, 900);
    await sleep(500);
    await tap("Schedule", { exact: true, last: true });
    await find("Launch checklist", { timeout: 20000 }).catch(() => {});
    await sleep(1200);
  } },
  { title: "Who came, and for how long", text: "Open any meeting for its details, who's in it right now, and the attendance report afterwards.", run: async () => {
    await tap("Product sync");
    await sleep(2500);
    await swipe(540, 1800, 540, 1000);
    await sleep(1500);
  } },
];

// ---------------------------------------------------------------------------------------------
// Film each beat on the phone, and render its slide.

const card = await (await newContext(browser)).newPage();
await card.setViewportSize({ width: 1920, height: 1080 });
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
async function slide(file, title, text, step, total) {
  await card.setContent(`<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=block" /><style>
    html,body{margin:0;width:1920px;height:1080px;overflow:hidden;font-family:Geist,sans-serif;color:#eef0f6;background:radial-gradient(ellipse at 75% 30%,#1f2250 0%,#12131f 55%,#0b0d12 100%)}
    .phone{position:absolute;left:300px;top:44px;width:452px;height:990px;border-radius:64px;background:#05060a;box-shadow:0 0 0 2px #2a3040,0 40px 80px rgba(0,0,0,.6)}
    .copy{position:absolute;left:900px;top:0;bottom:0;width:820px;display:flex;flex-direction:column;justify-content:center}
    .brand{display:flex;align-items:center;gap:14px;font-size:26px;font-weight:600;color:#b9c1ff}
    .brand svg{width:40px;height:40px}
    h1{font-size:72px;line-height:1.05;letter-spacing:-2px;margin:28px 0 0;font-weight:600}
    p{font-size:32px;line-height:1.45;color:#b4b9c8;margin:28px 0 0}
    .step{position:absolute;left:900px;bottom:70px;font-size:20px;color:#7c8396;letter-spacing:2px}
  </style></head><body>
    <div class="phone"></div>
    <div class="copy">
      <div class="brand"><svg viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d7cff"/><stop offset="1" stop-color="#8f6dff"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#g)"/><rect x="6" y="10" width="14" height="12" rx="3.5" fill="#fff"/><path d="M21.5 14.2 26 11.5v9l-4.5-2.7z" fill="#fff"/><circle cx="13" cy="16" r="2.4" fill="#7a74ff"/></svg>Convene for Android</div>
      <h1>${esc(title)}</h1>
      <p>${esc(text)}</p>
    </div>
    <div class="step">${String(step).padStart(2, "0")} / ${String(total).padStart(2, "0")}</div>
  </body></html>`, { waitUntil: "networkidle" });
  await card.screenshot({ path: file });
}

// A rounded-corner mask for the phone screen (1080x2424 scaled to 428x960).
const MASK = path.join(BUILD, "mask.png");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=black:s=428x960", "-vf", "format=gray,geq=lum='if(gt(abs(X-214)\\,214-52)*gt(abs(Y-480)\\,480-52)\\,if(lte(hypot(abs(X-214)-(214-52)\\,abs(Y-480)-(480-52))\\,52)\\,255\\,0)\\,255)'", "-frames:v", "1", MASK]);

const clips = [];
for (const [i, b] of beats.entries()) {
  const vo = voice(b.text);
  const want = LEAD + vo.seconds + TAIL;
  const raw = path.join(BUILD, `raw${String(i).padStart(2, "0")}.mp4`);
  const rec = record(raw);
  await sleep(700); // screenrecord takes a moment to start
  const started = Date.now();
  try {
    await b.run();
  } catch (e) {
    console.warn(`beat ${i}:`, e.message);
  }
  const left = want - (Date.now() - started) / 1000;
  if (left > 0) await sleep(left * 1000);
  await rec.stop();
  const bg = path.join(BUILD, `slide${i}.png`);
  await slide(bg, b.title, b.text, i + 1, beats.length);
  const seconds = Math.max(want, (Date.now() - started) / 1000);
  const out = path.join(BUILD, `beat${String(i).padStart(2, "0")}.mp4`);
  // Phone video (skipping screenrecord's warm-up) scaled into the frame on the slide.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-loop", "1", "-i", bg, "-ss", "0.6", "-i", raw, "-i", MASK, "-filter_complex",
    `[1:v]fps=30,scale=428:960,format=rgba[ph];[2:v]format=gray[m];[ph][m]alphamerge[phm];[0:v][phm]overlay=312:59:shortest=0,format=yuv420p[v]`,
    "-map", "[v]", "-t", seconds.toFixed(2), "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "17", out]);
  clips.push({ out, vo, seconds: probe(out) });
  console.log(`beat ${i}: ${clips.at(-1).seconds.toFixed(1)}s (voice ${vo.seconds.toFixed(1)}s)`);
}

// Outro: the same card as the main demo, pointing at the APK.
const outroText = "Download the app from the GitHub releases page. It's free and open source, like the rest of Convene.";
{
  const vo = voice(outroText);
  const bg = path.join(BUILD, "outro.png");
  await card.setContent(fs.readFileSync(path.join(HERE, "outro.html"), "utf8").replace("{{LIVE}}", "Android app: github.com/amanjhacodes55/convene/releases"), { waitUntil: "networkidle" });
  await card.evaluate(() => document.body.classList.add("in"));
  await sleep(1200);
  await card.screenshot({ path: bg });
  const out = path.join(BUILD, "beat99.mp4");
  const seconds = LEAD + vo.seconds + TAIL + 0.6;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-loop", "1", "-i", bg, "-t", seconds.toFixed(2), "-r", "30", "-vf", "format=yuv420p", "-c:v", "libx264", "-crf", "17", out]);
  clips.push({ out, vo, seconds: probe(out) });
}
await browser.close();

// Join the clips and lay the voice over them.
const list = path.join(BUILD, "clips.txt");
fs.writeFileSync(list, clips.map((c) => `file '${c.out}'`).join("\n"));
const total = clips.reduce((s, c) => s + c.seconds, 0);
const args = ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list];
const graph = [];
let t = 0;
clips.forEach((c, i) => {
  args.push("-i", c.vo.file);
  graph.push(`[${i + 1}:a]aresample=48000,adelay=${Math.round((t + LEAD) * 1000)}:all=1[a${i}]`);
  t += c.seconds;
});
graph.push(`${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0,highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=180,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5,aresample=48000,apad,atrim=0:${total.toFixed(3)}[a]`);
graph.push(`[0:v]fade=t=in:d=0.5,fade=t=out:st=${(total - 0.9).toFixed(3)}:d=0.9[v]`);
const out = path.join(MEDIA, "convene-android.mp4");
execFileSync("ffmpeg", [...args, "-filter_complex", graph.join(";"), "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
console.log(`done: ${out} (${total.toFixed(1)}s)`);
