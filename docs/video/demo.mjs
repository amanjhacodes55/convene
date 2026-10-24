// Records the Convene walkthrough: a real meeting in the running app, filmed from the host's side,
// with three teammates joining from their own browsers. Cameras and microphones are virtual personas
// (persona.js), so the video needs no real people. Narrated by Kokoro, small one-line captions.
//
//   1. npm run build && npx next start -p 3021
//   2. node docs/video/demo.mjs   (TTS_PYTHON / VOICE optional, see tts.py; LIVE_URL for the outro)
//
// Output: docs/media/convene-demo.mp4 (captions burned in); the .srt goes to build/.
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONAS } from "./personas.mjs";
import { BASE, launch, newContext, pointer, sleep, startRecording } from "./rec.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(HERE, "build");
const MEDIA = path.join(HERE, "../media");
const LEAD = 0.35; // beat starts, then the voice comes in
const TAIL = 0.6; // breathing room after a line before the next beat
// Python with kokoro-onnx installed (see tts.py); VOICE picks the Kokoro voice.
const PYTHON = process.env.TTS_PYTHON || path.join(process.env.HOME, ".local/share/kokoro-tts/venv/bin/python");
const VOICE = process.env.VOICE || "af_heart";
const LIVE = process.env.LIVE_URL || "Deploy free on Netlify: no media server needed";
fs.mkdirSync(path.join(BUILD, "voice"), { recursive: true });

function voice(text, caption = text) {
  const key = crypto.createHash("sha1").update(`${VOICE}\n${text}`).digest("hex").slice(0, 12);
  const file = path.join(BUILD, "voice", key + ".wav");
  if (!fs.existsSync(file)) execFileSync(PYTHON, [path.join(HERE, "tts.py"), file], { input: text, env: { ...process.env, VOICE }, stdio: ["pipe", "ignore", "inherit"] });
  return { file, seconds: probe(file), cues: cues(caption, file) };
}
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

// ---------------------------------------------------------------------------------------------
// Captions: one short line at a time. A line is split into phrases that fit, and each break is
// snapped to the pause the voice actually takes there, so the text changes when the speaker breathes.

const MAX_CHARS = 44;

function phrases(text) {
  // Break after punctuation first, then pack words so no caption runs past MAX_CHARS.
  const parts = text.match(/[^,.:;!?]+[,.:;!?]*\s*/g).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const last = out.at(-1);
    if (last && !/[.:;!?]$/.test(last) && last.length + 1 + p.length <= MAX_CHARS) out[out.length - 1] = `${last} ${p}`;
    else if (p.length <= MAX_CHARS) out.push(p);
    else out.push(...split(p));
  }
  return out;
}

// Halve an over-long phrase where a reader would pause: before a joining word, never after an article.
const JOIN = new Set(["and", "or", "but", "so", "with", "to", "that", "for", "in", "on", "right", "all", "then"]);
const STICKY = new Set(["a", "an", "the", "to", "of", "your", "its", "their"]);
function split(p) {
  if (p.length <= MAX_CHARS) return [p];
  const w = p.split(" ");
  let best = 1, score = Infinity;
  for (let i = 1; i < w.length; i++) {
    const left = w.slice(0, i).join(" "), right = w.slice(i).join(" ");
    let sc = Math.abs(left.length - right.length) + 20 * (Math.max(left.length, right.length) > MAX_CHARS);
    if (JOIN.has(w[i].toLowerCase())) sc -= 12;
    if (STICKY.has(w[i - 1].toLowerCase())) sc += 40;
    if (sc < score) { score = sc; best = i; }
  }
  return [...split(w.slice(0, best).join(" ")), ...split(w.slice(best).join(" "))];
}

function pauses(file) {
  const log = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "silencedetect=n=-38dB:d=0.12", "-f", "null", "-"]).stderr.toString();
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((s, i) => ({ s, e: ends[i] ?? s })).filter((p) => p.e > p.s);
}

function cues(text, file) {
  const lines = phrases(text);
  const total = probe(file);
  const gaps = pauses(file);
  const chars = lines.reduce((n, l) => n + l.length, 0);
  let acc = 0, start = 0;
  return lines.map((line, i) => {
    acc += line.length;
    let end = i === lines.length - 1 ? total : (acc / chars) * total;
    if (i < lines.length - 1) {
      const near = gaps.filter((g) => Math.abs((g.s + g.e) / 2 - end) < 0.7).sort((a, b) => Math.abs((a.s + a.e) / 2 - end) - Math.abs((b.s + b.e) / 2 - end))[0];
      if (near) end = near.s + 0.05;
    }
    const cue = { line, start, end };
    start = end;
    return cue;
  });
}

// ---------------------------------------------------------------------------------------------
// Setup (not recorded): Maya, who hosts and is filmed, plus three teammates in their own browsers.
// Each one's camera and microphone are a virtual persona (persona.js, cast in personas.mjs).

const PERSONA = fs.readFileSync(path.join(HERE, "persona.js"), "utf8");
const browser = await launch();
async function participant(key, filmed = false) {
  const ctx = filmed
    ? await newContext(browser, { permissions: ["clipboard-read", "clipboard-write"] })
    : await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(`window.__PERSONA__ = ${JSON.stringify(PERSONAS[key])};\n${PERSONA}`);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.warn(`[${key}]`, e.message));
  return page;
}
const app = await participant("maya", true);
const leo = await participant("leo");
const priya = await participant("priya");
const sam = await participant("sam");
await app.goto(BASE);
await app.waitForLoadState("networkidle");

const card = await (await newContext(browser)).newPage();
await card.setContent(fs.readFileSync(path.join(HERE, "outro.html"), "utf8").replace("{{LIVE}}", LIVE), { waitUntil: "networkidle" });

const A = pointer(app);
const say = (page, ms) => page.evaluate((ms) => window.__persona.say(ms), ms);
const tile = (name) => app.locator("[data-tile]", { hasText: name }).first();
let code = "";

/** A teammate opens the invite link and asks to join (the waiting room is on). */
async function knock(page, name) {
  await page.goto(`${BASE}/m/${code}`);
  await page.locator("#join:not([disabled])").waitFor();
  await page.fill("#name", name);
  await page.click("#join");
}

// ---------------------------------------------------------------------------------------------
// Beats: one or two sentences each, with the actions that happen while they're spoken.

const beats = [
  { page: app, text: "This is Convene: open-source video meetings that open in a browser tab. No app to install, and no account to make.", run: async () => {
    await sleep(700);
    await A.hover(app.getByRole("heading", { level: 1 }), { dx: 0.7, dy: 0.65, ms: 1300 });
    await sleep(900);
    await A.hover(app.locator("[aria-hidden] .card").first(), { dx: 0.5, dy: 0.45, ms: 1200 });
  } },
  { page: app, text: "Give your meeting a name, turn on the waiting room, and start it with one click.", run: async () => {
    await A.click(app.locator("#title"));
    await A.type("Weekly design review", { cps: 20 });
    await A.click(app.getByText("Use a waiting room"), { dx: 0.1 });
    await A.click(app.locator("#new-meeting"));
    await app.waitForURL(/\/m\/[a-z-]+$/);
    code = app.url().split("/m/")[1];
    await app.locator("#join:not([disabled])").waitFor();
  } },
  { page: app, text: "Before you join, check how you look and sound, and pick your camera, microphone, and speakers.", run: async () => {
    await sleep(400);
    await say(app, 2600);
    await A.hover(app.getByLabel("Microphone level"), { dx: 0.4, ms: 900 });
    await sleep(900);
    await A.hover(app.locator("select").nth(0), { ms: 800 });
    await sleep(300);
    await A.hover(app.locator("select").nth(1), { ms: 600 });
    await A.click(app.locator("#name"));
    await A.type("Maya Chen", { cps: 16 });
  } },
  { page: app, text: "Join, and copy the invite link to send to your team.", run: async () => {
    await A.click(app.locator("#join"));
    await app.locator("#ctl-mic").waitFor();
    await sleep(700);
    await A.click(app.locator('button[title="Copy invite link"]'));
    await sleep(600);
  } },
  { page: app, text: "With the waiting room on, people wait until you let them in. Admit them one at a time, or all at once.", run: async () => {
    await Promise.all([knock(leo, "Leo Park"), knock(priya, "Priya Nair"), knock(sam, "Sam Okafor")]);
    await app.getByText("Admit all").waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
    await sleep(500);
    await A.click(app.locator("#ctl-people"));
    await sleep(900);
    await A.click(app.getByText("Admit all"));
    await sleep(600);
  } },
  { page: app, text: "Everyone connects directly, peer to peer, so video stays sharp and private.", run: async () => {
    await A.click(app.getByRole("button", { name: /^Close people/ }));
    await Promise.all(["Leo Park", "Priya Nair", "Sam Okafor"].map((n) => app.waitForFunction((n) => [...document.querySelectorAll("[data-tile]")].some((t) => t.textContent.includes(n) && t.querySelector("video")?.videoWidth > 0), n, { timeout: 20_000 })));
    await sleep(400);
    await A.hover(tile("Sam Okafor"), { dx: 0.5, dy: 0.5, ms: 1000 });
    await sleep(500);
    await A.hover(tile("Priya Nair"), { dx: 0.5, dy: 0.5, ms: 900 });
  } },
  { page: app, text: "Whoever is talking gets a green outline, and speaker view puts them front and centre.", run: async () => {
    await say(leo, 9000);
    await A.hover(tile("Leo Park"), { dx: 0.45, dy: 0.6, ms: 900 });
    await sleep(1400);
    await A.click(app.getByRole("button", { name: "Change layout" }));
    await sleep(2600);
    await A.click(app.getByRole("button", { name: "Change layout" }));
  } },
  { page: app, text: "Raise your hand to speak next, or react without interrupting.", run: async () => {
    await priya.click("#ctl-hand");
    await sleep(900);
    await A.click(app.locator("#ctl-react"));
    await sleep(300);
    await A.click(app.getByRole("button", { name: "React 👏" }));
    await sam.click("#ctl-react");
    await sam.getByRole("button", { name: "React 🎉" }).click();
    await sleep(500);
    await A.click(app.getByRole("button", { name: "React ❤️" }));
    await app.keyboard.press("Escape");
  } },
  { page: app, text: "Chat with everyone during the call, and share links that open in a new tab.", run: async () => {
    await leo.click("#ctl-chat");
    await leo.fill("#chat-input", "Notes from last week: https://notes.acme.dev/design-review");
    await leo.keyboard.press("Enter");
    await sleep(900);
    await A.click(app.locator("#ctl-chat"));
    await sleep(500);
    await A.click(app.locator("#chat-input"));
    await A.type("Thanks Leo! Priya, take it away.", { cps: 22 });
    await app.keyboard.press("Enter");
  } },
  { page: app, text: "Share your screen, and it takes the stage for everyone.", run: async () => {
    await A.click(app.getByRole("button", { name: "Close chat" }));
    await priya.click("#ctl-hand");
    await priya.click("#ctl-share");
    await say(priya, 9000);
    await app.locator('[data-tile$=":screen"]').waitFor();
    await sleep(1600);
    await A.hover(app.locator('[data-tile$=":screen"]'), { dx: 0.55, dy: 0.5, ms: 1000 });
    await sleep(800);
    await priya.evaluate(() => window.__persona.nextSlide());
    await sleep(1200);
  } },
  { page: app, text: "As host, you can mute anyone, lock the meeting so nobody new can join, or remove someone.", run: async () => {
    await priya.click("#ctl-share");
    await A.click(app.locator("#ctl-people"));
    await sleep(600);
    const row = app.locator("aside .group", { hasText: "Sam Okafor" });
    await A.hover(row, { dx: 0.4, ms: 800 });
    await sleep(300);
    await A.click(row.getByRole("button", { name: "Mute" }));
    await sleep(700);
    await A.click(app.getByRole("switch", { name: /Lock meeting/ }));
    await sleep(500);
    await A.hover(row.getByRole("button", { name: "Remove Sam Okafor" }), { ms: 700 });
    await sleep(300);
  } },
  { page: app, text: "Record the meeting to your own computer. Everyone sees that it's being recorded, and nothing is uploaded.", run: async () => {
    await A.click(app.getByRole("button", { name: /^Close people/ }));
    await A.click(app.locator("#ctl-more"));
    await sleep(400);
    await A.click(app.locator("#menu-record"));
    await say(sam, 3000);
    await sleep(2800);
    await A.click(app.locator("#ctl-more"));
    await sleep(300);
    await A.click(app.locator("#menu-record"));
    await sleep(800);
  } },
  { page: app, text: "And when you're done, end the meeting for everyone.", run: async () => {
    await A.click(app.locator("#ctl-leave"));
    await sleep(500);
    await A.click(app.locator("#menu-end"));
    await sleep(800);
  } },
  { page: card, text: "Convene is free and open source, and runs on Netlify with no media server to manage. Grab it on GitHub.", run: async () => {
    await card.evaluate(() => document.body.classList.add("in"));
  } },
];

// ---------------------------------------------------------------------------------------------
// Record every beat, then lay the voice and captions over the joined clips.

const only = process.env.ONLY ? Number(process.env.ONLY) : null;
const clips = [];
for (const [i, b] of beats.entries()) {
  if (only !== null && i > only) break;
  const vo = voice(b.say ?? b.text, b.text);
  const want = LEAD + vo.seconds + TAIL;
  await b.page.bringToFront();
  const rec = await startRecording(b.page);
  const started = Date.now();
  await b.run();
  const left = want - (Date.now() - started) / 1000;
  if (left > 0) await sleep(left * 1000);
  const out = path.join(BUILD, `beat${String(i).padStart(2, "0")}.mp4`);
  await rec.stop(out);
  clips.push({ out, vo, text: b.text, seconds: probe(out) });
  console.log(`beat ${i}: ${clips.at(-1).seconds.toFixed(1)}s (voice ${vo.seconds.toFixed(1)}s)`);
}
await browser.close();

const list = path.join(BUILD, "clips.txt");
fs.writeFileSync(list, clips.map((c) => `file '${c.out}'`).join("\n"));
const total = clips.reduce((s, c) => s + c.seconds, 0);
const args = ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list];
const graph = [];
let t = 0, srt = "", n = 0;
const ass = [
  "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1920", "PlayResY: 1080", "WrapStyle: 2", "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  // Small white text on a soft dark box, sitting low and centred.
  "Style: Cap,Noto Sans,34,&H00FFFFFF,&H00FFFFFF,&H5A16131F,&H00000000,0,0,0,0,100,100,0.3,0,3,9,0,2,40,40,46,1",
  "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
];
const stamp = (s) => new Date(s * 1000).toISOString().slice(11, 23).replace(".", ",");
const assStamp = (s) => { const d = new Date(s * 1000).toISOString(); return `${Number(d.slice(11, 13))}${d.slice(13, 22)}`; };
clips.forEach((c, i) => {
  args.push("-i", c.vo.file);
  graph.push(`[${i + 1}:a]aresample=48000,adelay=${Math.round((t + LEAD) * 1000)}:all=1[a${i}]`);
  for (const q of c.vo.cues) {
    // Only the last line of a beat lingers; inside a beat, one line hands straight to the next.
    const a = t + LEAD + q.start, b = t + LEAD + q.end + (q === c.vo.cues.at(-1) ? 0.25 : -0.02);
    srt += `${++n}\n${stamp(a)} --> ${stamp(b)}\n${q.line}\n\n`;
    ass.push(`Dialogue: 0,${assStamp(a)},${assStamp(b)},Cap,,0,0,0,,{\\fad(120,120)}${q.line}`);
  }
  t += c.seconds;
});
const assFile = path.join(BUILD, "captions.ass");
fs.writeFileSync(assFile, ass.join("\n") + "\n");

// Voice only, no music bed: a little warmth and gentle compression.
graph.push(`${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0,`
  + `highpass=f=70,equalizer=f=180:t=q:w=1:g=1.5,equalizer=f=6500:t=q:w=1.5:g=-2,`
  + `acompressor=threshold=-20dB:ratio=2.5:attack=8:release=180,aformat=channel_layouts=stereo,`
  + `loudnorm=I=-16:TP=-1.5,aresample=48000,apad,atrim=0:${total.toFixed(3)}[a]`);
graph.push(`[0:v]ass='${assFile.replace(/'/g, "\\'")}',fade=t=in:d=0.5,fade=t=out:st=${(total - 0.9).toFixed(3)}:d=0.9[v]`);
const out = path.join(only !== null ? BUILD : MEDIA, "convene-demo.mp4");
execFileSync("ffmpeg", [...args, "-filter_complex", graph.join(";"), "-map", "[v]", "-map", "[a]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
// Kept out of docs/media: players auto-load a same-named .srt on top of the burned-in captions.
fs.writeFileSync(path.join(BUILD, "convene-demo.srt"), srt);
console.log(`done: ${out} (${total.toFixed(1)}s)`);
