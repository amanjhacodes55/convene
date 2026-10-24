// End-to-end: real browsers in a real call, through the UI. Needs a running server and Chrome.
//
//   npm run build && npx next start -p 3020 &
//   BASE=http://localhost:3020 npm run e2e
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3020";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";

// Chrome's fake camera and microphone, with the permission prompts accepted.
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});

// Screen capture has no picker to click in headless Chrome: hand back a painted canvas instead.
const fakeScreen = () => {
  navigator.mediaDevices.getDisplayMedia = async () => {
    const c = Object.assign(document.createElement("canvas"), { width: 1280, height: 720 });
    const g = c.getContext("2d");
    setInterval(() => {
      g.fillStyle = "#1d4ed8";
      g.fillRect(0, 0, 1280, 720);
      g.fillStyle = "#fff";
      g.font = "64px sans-serif";
      g.fillText(`Slide ${new Date().getSeconds()}`, 80, 140);
    }, 100);
    return c.captureStream(15);
  };
};

async function person(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["camera", "microphone", "clipboard-read", "clipboard-write"] });
  await ctx.addInitScript(fakeScreen);
  const page = await ctx.newPage();
  // A deployed site can be slow on its first cold load.
  page.setDefaultNavigationTimeout(90_000);
  page.on("pageerror", (e) => console.error(`[${name}] page error:`, e.message));
  return page;
}

async function enter(page, name) {
  await page.fill("#name", name);
  await page.click("#join");
}

const remoteVideoPlaying = (page, name) =>
  page.waitForFunction(
    (n) =>
      [...document.querySelectorAll("[data-tile]")].some(
        (t) => t.getAttribute("data-tile") !== "self" && t.textContent.includes(n) && t.querySelector("video")?.videoWidth > 0,
      ),
    name,
    { timeout: 20_000 },
  );

const tiles = (page) => page.locator("[data-tile]").count();
const steps = [];
const step = async (label, fn) => {
  const t = Date.now();
  await fn();
  steps.push(label);
  console.log(`✓ ${label} (${Date.now() - t} ms)`);
};

try {
  const host = await person("host");
  const guest = await person("guest");
  let code;

  await step("host starts a meeting from the home page", async () => {
    await host.goto(BASE);
    await host.fill("#title", "E2E sync");
    await host.click("#new-meeting");
    await host.waitForURL(/\/m\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    code = host.url().split("/m/")[1];
    await enter(host, "Hana Host");
    await host.waitForSelector("#ctl-mic");
  });

  await step("a guest joins and both see each other's video", async () => {
    await guest.goto(`${BASE}/m/${code}`);
    await enter(guest, "Gus Guest");
    await guest.waitForSelector("#ctl-mic");
    await remoteVideoPlaying(host, "Gus Guest");
    await remoteVideoPlaying(guest, "Hana Host");
  });

  await step("chat reaches the other side", async () => {
    await guest.click("#ctl-chat");
    await guest.fill("#chat-input", "Hello from the guest https://example.com");
    await guest.keyboard.press("Enter");
    await host.click("#ctl-chat");
    await host.getByText("Hello from the guest").waitFor({ timeout: 10_000 });
    assert.equal(await host.locator('a[href="https://example.com"]').count(), 1);
  });

  await step("muting shows on the other side", async () => {
    await guest.click("#ctl-mic");
    await host.locator('[data-tile]:has-text("Gus Guest") [aria-label="Muted"]').waitFor({ timeout: 10_000 });
  });

  await step("a screen share takes the stage", async () => {
    await guest.click("#ctl-share");
    await host.waitForFunction(() => {
      const v = document.querySelector('[data-tile$=":screen"] video');
      return v && v.videoWidth === 1280;
    }, null, { timeout: 15_000 });
    await guest.click("#ctl-share");
    await host.locator('[data-tile$=":screen"]').waitFor({ state: "detached", timeout: 10_000 });
  });

  await step("the waiting room holds a newcomer until the host admits them", async () => {
    await host.click("#ctl-people");
    await host.getByRole("switch", { name: /Waiting room/ }).click();
    const late = await person("late");
    await late.goto(`${BASE}/m/${code}`);
    await late.getByRole("button", { name: "Ask to join" }).waitFor({ timeout: 15_000 });
    await enter(late, "Lia Late");
    await late.getByText("Waiting for the host").waitFor();
    await host.getByRole("button", { name: "Admit" }).click();
    await remoteVideoPlaying(late, "Hana Host");
    await remoteVideoPlaying(host, "Lia Late");
    await remoteVideoPlaying(guest, "Lia Late");
    assert.equal(await tiles(host), 3);
    await late.context().close();
    await host.waitForFunction(() => document.querySelectorAll("[data-tile]").length === 2, null, { timeout: 45_000 });
  });

  await step("the host ends the meeting for everyone", async () => {
    await host.click("#ctl-leave");
    await host.click("#menu-end");
    await guest.getByText("The host ended the meeting").waitFor({ timeout: 15_000 });
  });

  console.log(`\nall ${steps.length} steps passed`);
} catch (e) {
  console.error(`\n✗ failed after: ${steps.at(-1) ?? "start"}\n`, e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
