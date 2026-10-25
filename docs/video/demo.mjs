// Records the Convene walkthrough in the running app, filmed from the host's side: an account and a
// scheduled meeting, a developer app with webhooks, a real meeting with three teammates joining from
// their own browsers, an app posting into the live chat, the attendance report, and OAuth. Cameras
// and microphones are virtual personas (persona.js), so the video needs no real people. Narrated by
// Kokoro, small one-line captions.
//
//   1. npm run build && npx next start -p 3021   (a fresh server: the demo signs up as Maya)
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
// Each one's camera and microphone are a virtual persona (persona.js, cast in personas.mjs). Maya has
// two tabs: the call, and the developer portal beside it. Start from a fresh server: the demo signs up.

const PERSONA = fs.readFileSync(path.join(HERE, "persona.js"), "utf8");
const browser = await launch();
async function participant(key, filmed = false) {
  const ctx = filmed
    ? await newContext(browser, { permissions: ["clipboard-read", "clipboard-write"], acceptDownloads: false })
    : await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(`window.__PERSONA__ = ${JSON.stringify(PERSONAS[key])};\n${PERSONA}`);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.warn(`[${key}]`, e.message));
  return page;
}
const app = await participant("maya", true);
const dev = await app.context().newPage();
dev.on("pageerror", (e) => console.warn("[dev]", e.message));
const leo = await participant("leo");
const priya = await participant("priya");
const sam = await participant("sam");
await app.goto(BASE);
await app.waitForLoadState("networkidle");

// An attendee's own browser, filmed while they register.
const reg = await (await newContext(browser)).newPage();
const R = pointer(reg);
const joinUrls = {};

const card = await (await newContext(browser)).newPage();
await card.setContent(fs.readFileSync(path.join(HERE, "outro.html"), "utf8").replace("{{LIVE}}", LIVE), { waitUntil: "networkidle" });

const A = pointer(app);
const D = pointer(dev);
const say = (page, ms) => page.evaluate((ms) => window.__persona.say(ms), ms);
const caption = (page, text, ms) => page.evaluate(([t, ms]) => window.__persona.caption(t, ms), [text, ms]);
const tile = (name) => app.locator("[data-tile]", { hasText: name }).first();
const nav = (label) => app.locator("aside").getByRole("link", { name: label });
let code = "";
let appUrl = "";
let oauthSecret = "";

/** A teammate opens their personal link (registration and passcode in it) and asks to join. */
async function knock(page, name) {
  await page.goto(joinUrls[name]);
  await page.locator("#join:not([disabled])").waitFor();
  // The lobby fills in their registered name.
  await page.waitForFunction(() => document.querySelector("#name")?.value);
  await page.click("#join");
}

/** Opens a tile's menu and picks an action. */
async function tileAction(name, action) {
  await A.hover(tile(name), { dx: 0.6, dy: 0.4, ms: 800 });
  await sleep(250);
  await A.click(app.getByRole("button", { name: `Options for ${name}` }));
  await sleep(350);
  await A.click(app.getByRole("menuitem", { name: action }));
}

// ---------------------------------------------------------------------------------------------
// Beats: one or two sentences each, with the actions that happen while they're spoken.

const beats = [
  // ---- the product and an account
  { page: app, text: "This is Convene: open-source video meetings that run in a browser tab, with a developer platform like Zoom's, that you can host yourself.", run: async () => {
    await sleep(600);
    await A.hover(app.getByRole("heading", { level: 1 }), { dx: 0.7, dy: 0.65, ms: 1300 });
    await sleep(1200);
    await A.hover(app.locator("[aria-hidden] .card").first(), { dx: 0.5, dy: 0.45, ms: 1200 });
    await sleep(900);
    await A.hover(app.getByRole("link", { name: "Developers" }).first(), { ms: 900 });
  } },
  { page: app, text: "Joining never needs an account. A free one adds scheduling, attendance reports, and the developer tools.", run: async () => {
    await A.click(app.getByRole("link", { name: "Sign up free" }));
    await app.locator("#su-name").waitFor();
    await A.click(app.locator("#su-name"));
    await A.type("Maya Chen", { cps: 18 });
    await A.click(app.locator("#su-email"));
    await A.type("maya@acme.dev", { cps: 22 });
    await A.click(app.locator("#su-password"));
    await A.type("a long passphrase", { cps: 26 });
    await A.click(app.locator("#su-submit"));
    await app.waitForURL(/\/app$/);
  } },
  { page: app, text: "Schedule a meeting with a topic, a time and an agenda. As on Zoom, protect it with a passcode and a waiting room, and require registration that you approve, with a phone number.", run: async () => {
    await sleep(300);
    await A.click(app.locator("#schedule"));
    await A.click(app.locator("#sched-topic"));
    await A.type("Weekly design review", { cps: 24 });
    await A.click(app.locator("#sched-agenda"));
    await A.type("Onboarding flow and launch checklist", { cps: 34 });
    await A.hover(app.locator("#sched-passcode"), { ms: 700 });
    await sleep(300);
    await A.hover(app.locator("#sched-registration"), { ms: 600 });
    await app.selectOption("#sched-registration", "manual");
    await sleep(300);
    await A.click(app.locator("#sched-phone"));
    await A.click(app.locator("#sched-more"));
    await sleep(500);
    await A.hover(app.locator("#sched-hide-list"), { dx: 0.3, ms: 700 });
    await sleep(400);
    await A.click(app.locator("#sched-save"));
    await app.locator("[data-meeting]").waitFor();
    code = await app.locator("[data-meeting]").getAttribute("data-meeting");
    await sleep(500);
    await A.hover(app.locator("[data-meeting]"), { dx: 0.3, ms: 900 });
  } },

  { page: reg, text: "Attendees register with their name, email and phone, and wait for you to approve them.", before: async () => {
    await reg.goto(`${BASE}/r/${code}`);
    await reg.locator("#reg-name").waitFor();
  }, run: async () => {
    await sleep(400);
    await R.click(reg.locator("#reg-name"));
    await R.type("Leo Park", { cps: 20 });
    await R.click(reg.locator("#reg-email"));
    await R.type("leo@acme.dev", { cps: 24 });
    await R.click(reg.locator("#reg-phone"));
    await R.type("+1 415 555 0142", { cps: 20 });
    await R.click(reg.locator("#reg-submit"));
    await reg.locator("#reg-pending").waitFor();
    await sleep(600);
  } },
  { page: app, text: "Approve them from the meeting's page, and their personal join link appears. You can export every registrant too.", run: async () => {
    await A.click(app.locator("[data-meeting]"));
    await app.locator("#registrants").waitFor();
    await sleep(300);
    await A.scroll(420, 900);
    await sleep(300);
    await A.click(app.locator('[data-approve="leo@acme.dev"]'));
    await sleep(500);
    await A.hover(app.locator("#registrants").getByRole("button", { name: "CSV" }), { ms: 700 });
    await reg.locator("#reg-approved").waitFor({ timeout: 15_000 });
    joinUrls["Leo Park"] = await reg.locator("#reg-join").getAttribute("href");
    // The other two register off camera; the host adds them, approved.
    for (const [name, email, phone] of [["Priya Nair", "priya@acme.dev", "+1 415 555 0177"], ["Sam Okafor", "sam@acme.dev", "+1 415 555 0193"]]) {
      joinUrls[name] = await app.evaluate(async ([c, name, email, phone]) => (await (await fetch(`/api/meetings/${c}/registrants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, phone }) })).json()).join_url, [code, name, email, phone]);
    }
    await sleep(400);
  } },

  // ---- a developer app with webhooks
  { page: app, text: "Now the developer side. Create a server-to-server app for your own scripts, and choose exactly which scopes its tokens get. The secret is shown once, so copy it now.", run: async () => {
    await A.click(nav("Your apps"));
    await app.locator("#create-app").waitFor();
    await A.click(app.locator("#create-app"));
    await sleep(400);
    await A.click(app.locator("#type-server"));
    await A.click(app.locator("#app-name"));
    await A.type("Team sync bot", { cps: 22 });
    await A.click(app.locator("#app-description"));
    await A.type("Syncs meetings to our tracker", { cps: 34 });
    for (const s of ["meeting:write", "participant:read", "chat:write"]) await A.click(app.locator(`[data-scope="${s}"]`), { ms: 450 });
    await A.click(app.locator("#app-create"));
    await app.locator("#new-client-secret").waitFor();
    await sleep(600);
    await A.hover(app.locator("#new-client-secret"), { dx: 0.3, ms: 700 });
    await sleep(500);
    await A.click(app.locator("#go-to-app"));
    await app.waitForURL(/\/developers\/apps\/[0-9a-f]{16}$/);
    appUrl = app.url();
  } },
  { page: app, text: "Subscribe to webhooks for the events you care about. No server yet? Point them at the built-in test inbox.", run: async () => {
    await A.click(app.locator("#tab-webhooks"));
    await A.click(app.locator("#use-inbox"));
    await sleep(300);
    for (const e of ["participant.waiting", "meeting.registration_created"]) await A.click(app.locator(`[data-event="${e}"]`), { ms: 500 });
    await A.click(app.locator("#save-hook"));
    await sleep(500);
    await A.scroll(320, 900);
    await sleep(300);
  } },

  // ---- the meeting
  { page: app, text: "Back in Meetings, start the one you scheduled. As its owner, you're the host on any device.", run: async () => {
    await A.scroll(-400, 600);
    await A.click(nav("Meetings"));
    await app.locator("[data-meeting]").waitFor();
    await sleep(300);
    await A.click(app.locator("[data-meeting]").getByRole("link", { name: "Start" }));
    await app.locator("#join:not([disabled])").waitFor();
    await sleep(500);
  } },
  { page: app, text: "Check how you look and sound, and pick your camera, microphone and speakers, before you go in.", run: async () => {
    await say(app, 2600);
    await A.hover(app.getByLabel("Microphone level"), { dx: 0.4, ms: 900 });
    await sleep(900);
    await A.hover(app.locator("select").nth(0), { ms: 800 });
    await sleep(300);
    await A.hover(app.locator("select").nth(1), { ms: 600 });
    await sleep(300);
    await A.click(app.locator("#join"));
    await app.locator("#ctl-mic").waitFor();
    // The portal tab, off camera, so the API beat later opens on the app.
    await dev.goto(appUrl);
  } },
  { page: app, top: true, text: "Teammates knock with their personal links. Admit them straight from the notice, or let everyone in at once.", run: async () => {
    await knock(leo, "Leo Park");
    const toast = app.locator(".toast", { hasText: "Leo Park" });
    await toast.waitFor({ timeout: 15_000 });
    await Promise.all([knock(priya, "Priya Nair"), knock(sam, "Sam Okafor")]);
    await sleep(300);
    await A.click(toast.getByRole("button", { name: "Admit" }));
    await sleep(600);
    await A.click(app.locator("#ctl-people"));
    await app.getByText("Admit all").waitFor({ timeout: 15_000 });
    await sleep(500);
    await A.click(app.getByText("Admit all"));
    await sleep(600);
  } },
  { page: app, top: true, text: "Everyone connects directly, peer to peer, so video stays sharp, and private.", before: async () => {
    // Connections take a few seconds to set up: wait off camera.
    await app.getByRole("button", { name: /^Close people/ }).click();
    await Promise.all(["Leo Park", "Priya Nair", "Sam Okafor"].map((n) => app.waitForFunction((n) => [...document.querySelectorAll("[data-tile]")].some((t) => t.textContent.includes(n) && t.querySelector("video")?.videoWidth > 0), n, { timeout: 25_000 })));
  }, run: async () => {
    await sleep(400);
    await A.hover(tile("Sam Okafor"), { dx: 0.5, dy: 0.5, ms: 1000 });
    await sleep(500);
    await A.hover(tile("Priya Nair"), { dx: 0.5, dy: 0.5, ms: 900 });
  } },
  { page: app, top: true, text: "Whoever is talking gets a green outline. Switch to speaker view from the View menu, and the stage follows whoever has the floor.", run: async () => {
    await say(leo, 9000);
    await A.hover(tile("Leo Park"), { dx: 0.45, dy: 0.6, ms: 900 });
    await sleep(900);
    await A.click(app.locator("#ctl-view"));
    await sleep(350);
    await A.click(app.locator("#view-speaker"));
    await sleep(2400);
    await A.click(app.locator("#ctl-view"));
    await sleep(300);
    await A.click(app.locator("#view-gallery"));
  } },
  { page: app, top: true, text: "As host, open anyone's tile menu and spotlight them. They fill the stage for everyone in the call, until you take it off.", run: async () => {
    await tileAction("Priya Nair", "Spotlight for everyone");
    await say(priya, 4000);
    await sleep(2600);
    await tileAction("Priya Nair", "Remove spotlight");
  } },
  { page: app, top: true, text: "Turn on live captions, and read along as people talk.", run: async () => {
    await A.click(app.locator("#ctl-cc"));
    // Leo's browser starts listening once it hears that someone wants captions.
    await leo.waitForFunction(() => window.__persona.listening(), null, { timeout: 10_000 });
    await caption(leo, "I pushed the new onboarding screens this morning, so take a look when you can.", 4200);
    await sleep(3600);
  } },
  { page: app, top: true, text: "Raise a hand to speak next, or react without interrupting.", run: async () => {
    await A.click(app.locator("#ctl-cc"));
    await priya.click("#ctl-hand");
    await sleep(800);
    await A.click(app.locator("#ctl-react"));
    await sleep(300);
    await A.click(app.getByRole("button", { name: "React 👏" }));
    await sam.click("#ctl-react");
    await sam.getByRole("button", { name: "React 🎉" }).click();
    await sleep(400);
    await A.click(app.getByRole("button", { name: "React ❤️" }));
    await app.keyboard.press("Escape");
  } },
  { page: app, top: true, text: "Chat with everyone, and share links that open in a new tab. Or message someone privately, straight from their tile; only they will see it.", run: async () => {
    await leo.click("#ctl-chat");
    await leo.fill("#chat-input", "Screens are here: https://figma.acme.dev/onboarding");
    await leo.keyboard.press("Enter");
    await sleep(700);
    await tileAction("Sam Okafor", "Message privately");
    await sleep(400);
    await A.click(app.locator("#chat-input"));
    await A.type("Can you take notes today?", { cps: 22 });
    await app.keyboard.press("Enter");
    await sleep(600);
  } },
  { page: app, top: true, text: "Share your screen, and it takes the stage for everyone, with the presenter's camera in the strip beside it.", run: async () => {
    await A.click(app.getByRole("button", { name: "Close chat" }));
    await priya.click("#ctl-hand");
    await priya.click("#ctl-share");
    await say(priya, 9000);
    await app.locator('[data-tile$=":screen"]').waitFor();
    await sleep(1500);
    await A.hover(app.locator('[data-tile$=":screen"]'), { dx: 0.55, dy: 0.5, ms: 1000 });
    await sleep(700);
    await priya.evaluate(() => window.__persona.nextSlide());
    await sleep(1100);
  } },
  { page: app, top: true, text: "Switch microphones mid-call, and check the meeting's details and encryption at a glance.", run: async () => {
    await priya.click("#ctl-share");
    await A.click(app.getByRole("button", { name: "Audio options" }));
    await sleep(700);
    await A.click(app.getByRole("button", { name: "USB Headset" }).first());
    await sleep(400);
    await app.keyboard.press("Escape");
    await A.click(app.locator("#meeting-info"));
    await sleep(900);
    await A.hover(app.locator("#copy-link"), { ms: 700 });
    await sleep(700);
    await app.keyboard.press("Escape");
  } },
  { page: app, top: true, text: "As host, you see who everyone is, with their email and phone. Mute anyone, lock the meeting, or remove someone.", run: async () => {
    await A.click(app.locator("#ctl-people"));
    await sleep(500);
    await A.hover(app.locator("[data-contact]").first(), { dx: 0.4, ms: 800 });
    await sleep(700);
    const row = app.locator("aside .group", { hasText: "Sam Okafor" });
    await A.hover(row, { dx: 0.4, ms: 800 });
    await sleep(300);
    await A.click(row.getByRole("button", { name: "Mute" }));
    await sleep(600);
    await A.click(app.getByRole("switch", { name: /Lock meeting/ }));
    await sleep(500);
    await A.hover(row.getByRole("button", { name: "Remove Sam Okafor" }), { ms: 700 });
    await sleep(300);
  } },

  { page: app, top: true, text: "The Security menu works like Zoom's. Hide the participant list, keep chat with the host, or keep screen sharing to yourself, live, for everyone.", run: async () => {
    await A.click(app.getByRole("button", { name: /^Close people/ }));
    await A.click(app.locator("#ctl-security"));
    await sleep(600);
    await A.click(app.locator("#sec-hide-list"));
    await sleep(300);
    await A.click(app.locator("#sec-chat-host"));
    await sleep(300);
    await A.click(app.locator("#sec-share"));
    await sleep(600);
    await app.keyboard.press("Escape");
  } },
  { page: app, top: true, text: "Run a quick poll. Votes come in live, and the results go to everyone when you end it.", run: async () => {
    await A.click(app.locator("#ctl-polls"));
    await A.click(app.locator("#poll-question"));
    await A.type("Ship the new onboarding on Friday?", { cps: 30 });
    await A.click(app.locator('[data-poll-option="0"]'));
    await A.type("Yes, ship it", { cps: 30 });
    await A.click(app.locator('[data-poll-option="1"]'));
    await A.type("Next week", { cps: 30 });
    await A.click(app.locator("#poll-launch"));
    for (const [p, choice] of [[leo, "Yes, ship it"], [priya, "Yes, ship it"], [sam, "Next week"]]) {
      await p.click("#ctl-polls");
      await p.getByRole("button", { name: choice }).click();
      await sleep(500);
    }
    await sleep(600);
    await A.click(app.locator("#poll-end"));
    await sleep(800);
  } },
  { page: app, top: true, text: "Make someone a co-host, and they get the host controls too.", run: async () => {
    await A.click(app.locator("#ctl-people"));
    await sleep(400);
    await A.hover(app.locator("aside .group", { hasText: "Leo Park" }), { dx: 0.4, ms: 700 });
    await A.click(app.getByRole("button", { name: "Make Leo Park a co-host" }));
    await sleep(900);
    await A.click(app.getByRole("button", { name: /^Close people/ }));
  } },

  // ---- the API and webhooks, while the meeting runs
  { page: dev, text: "Meanwhile, apps can reach into a live meeting. In the API playground, post a message to its chat.", run: async () => {
    await sleep(400);
    await D.click(dev.locator("#tab-playground"));
    await sleep(300);
    await D.click(dev.locator('[data-endpoint="post-message"]'));
    await sleep(500);
    await D.hover(dev.locator("#pg-meeting"), { ms: 700 });
    await sleep(300);
    await D.click(dev.locator("#pg-send"));
    await dev.locator("#pg-status").waitFor();
    await sleep(400);
    await D.scroll(380, 1000);
  } },
  { page: app, top: true, text: "It shows up in everyone's chat, labelled with the app's name.", run: async () => {
    await sleep(400);
    await A.click(app.locator("#ctl-chat"));
    await sleep(600);
    await A.hover(app.locator("[data-app-message]").last(), { dx: 0.5, ms: 900 });
    await sleep(800);
  } },
  { page: dev, text: "And every knock, join and start reached the test inbox as a webhook, with its signature checked.", run: async () => {
    await D.scroll(-600, 600);
    await D.click(dev.locator("#tab-webhooks"));
    await dev.locator("#inbox").waitFor({ timeout: 15_000 });
    await sleep(300);
    await D.scroll(560, 1100);
    await sleep(400);
    await D.click(dev.locator("#inbox button", { hasText: "participant.joined" }).first());
    await sleep(600);
    await D.hover(dev.locator("#inbox").getByText("Signature verified"), { ms: 800 });
    await sleep(500);
  } },
  { page: app, top: true, text: "Record to your own computer. Everyone sees it's being recorded, and nothing is uploaded.", run: async () => {
    await A.click(app.getByRole("button", { name: "Close chat" }));
    await A.click(app.locator("#ctl-record"));
    await say(leo, 3000);
    await sleep(2600);
    await A.click(app.locator("#ctl-record"));
    await sleep(700);
  } },
  { page: app, top: true, text: "When you're done, end the meeting for everyone.", run: async () => {
    await A.click(app.locator("#ctl-leave"));
    await sleep(500);
    await A.click(app.locator("#menu-end"));
    await sleep(900);
  } },
  { page: app, text: "Then see who attended, with their email and phone, when they joined and left, and for how long.", run: async () => {
    await app.goto(`${BASE}/app/meetings/${code}`);
    await app.getByRole("heading", { name: "Attendance report" }).waitFor();
    await sleep(400);
    await A.scroll(900, 1400);
    await sleep(500);
    await A.hover(app.locator("table").last().locator("tbody tr").nth(1), { dx: 0.4, ms: 900 });
    await sleep(600);
  } },

  // ---- OAuth for apps other people install
  { page: app, text: "Building an app for other people? Make it an OAuth app, with a redirect URI and the scopes it needs.", run: async () => {
    await A.scroll(-500, 500);
    await A.click(nav("Your apps"));
    await A.click(app.locator("#create-app"));
    await sleep(300);
    await A.click(app.locator("#type-oauth"));
    await A.click(app.locator("#app-name"));
    await A.type("Notes bot", { cps: 18 });
    await A.click(app.locator("#app-description"));
    await A.type("Takes notes in your meetings", { cps: 30 });
    await A.click(app.locator('[data-scope="chat:write"]'), { ms: 500 });
    await A.click(app.locator("#app-create"));
    oauthSecret = await app.locator("#new-client-secret").textContent();
    await sleep(500);
    await A.click(app.locator("#go-to-app"));
    await app.locator("#test-install").waitFor();
    await sleep(300);
    await A.scroll(300, 800);
  } },
  { page: app, text: "People see exactly what it's asking for, and choose to allow it.", run: async () => {
    await A.click(app.locator("#test-install"));
    await app.locator("#consent-allow").waitFor();
    await sleep(900);
    await A.hover(app.getByText("Post messages into the chat of your live meetings"), { dx: 0.3, ms: 900 });
    await sleep(900);
    await A.click(app.locator("#consent-allow"));
    await app.waitForURL(/\/developers\/callback/);
  } },
  { page: app, text: "Your server swaps the code for tokens, and calls the API on their behalf. Tokens refresh, and can be revoked at any time.", run: async () => {
    await sleep(500);
    await A.click(app.locator("#cb-secret"));
    await app.fill("#cb-secret", oauthSecret);
    await sleep(300);
    await A.click(app.locator("#cb-exchange"));
    await app.getByText("refresh_token").waitFor();
    await sleep(700);
    await A.click(app.locator("#cb-me"));
    await sleep(500);
    await A.scroll(500, 1100);
  } },
  { page: app, text: "And it's all documented: endpoints, scopes, errors, and how to verify webhook signatures.", run: async () => {
    await app.goto(`${BASE}/developers/docs`);
    await sleep(500);
    await A.hover(app.locator('nav[aria-label="On this page"]'), { dx: 0.5, dy: 0.3, ms: 900 });
    await A.click(app.locator('nav[aria-label="On this page"] a[href="#create-meeting"]'));
    await sleep(1400);
    await A.click(app.locator('nav[aria-label="On this page"] a[href="#webhooks"]'));
    await sleep(800);
    await A.scroll(700, 1400);
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
  await b.before?.();
  await b.page.bringToFront();
  const rec = await startRecording(b.page);
  const started = Date.now();
  await b.run();
  const left = want - (Date.now() - started) / 1000;
  if (left > 0) await sleep(left * 1000);
  const out = path.join(BUILD, `beat${String(i).padStart(2, "0")}.mp4`);
  await rec.stop(out);
  clips.push({ out, vo, text: b.text, top: b.top, seconds: probe(out) });
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
    // In the call the controls are along the bottom, so captions move to the top there.
    ass.push(`Dialogue: 0,${assStamp(a)},${assStamp(b)},Cap,,0,0,0,,{\\fad(120,120)${c.top ? "\\an8" : ""}}${q.line}`);
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
