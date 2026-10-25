// End-to-end: Zoom-style meeting controls through the UI. Needs a running server and Chrome.
//
//   npm run build && npx next start -p 3020 &
//   BASE=http://localhost:3020 node tests/e2e/controls.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3020";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
async function person(name) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, permissions: ["camera", "microphone", "clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(90_000);
  page.on("pageerror", (e) => console.error(`[${name}] page error:`, e.message));
  return page;
}

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
  let code, passcode;

  await step("a host schedules a meeting with a passcode, manual registration and a hidden participant list", async () => {
    await host.goto(`${BASE}/signin?mode=signup`);
    await host.fill("#su-name", "Hana Host");
    await host.fill("#su-email", `host-${Date.now()}@example.com`);
    await host.fill("#su-password", "correct horse battery");
    await host.click("#su-submit");
    await host.waitForURL(/\/app$/);
    await host.click("#schedule");
    await host.fill("#sched-topic", "Customer webinar");
    passcode = await host.inputValue("#sched-passcode");
    await host.selectOption("#sched-registration", "manual");
    await host.check("#sched-phone");
    await host.click("#sched-more");
    await host.check("#sched-hide-list");
    await host.click("#sched-save");
    code = await host.locator("[data-meeting]").getAttribute("data-meeting");
    assert.match(passcode, /^\d{6}$/);
  });

  await step("a guest has to register, and waits for approval", async () => {
    await guest.goto(`${BASE}/m/${code}`);
    await guest.locator("#gate-register").waitFor();
    await guest.click("#go-register");
    await guest.fill("#reg-name", "Gus Guest");
    await guest.fill("#reg-email", "gus@example.com");
    await guest.fill("#reg-phone", "+1 555 0100");
    await guest.click("#reg-submit");
    await guest.locator("#reg-pending").waitFor();
  });

  await step("the host approves them, and the guest's page hands them their link", async () => {
    await host.goto(`${BASE}/app/meetings/${code}`);
    await host.locator('[data-approve="gus@example.com"]').click();
    await guest.locator("#reg-approved").waitFor({ timeout: 15_000 });
  });

  await step("the host starts; the guest joins with their link and the passcode, and is admitted", async () => {
    await host.click("#start-meeting");
    await host.locator("#join:not([disabled])").waitFor();
    await host.click("#join");
    await host.waitForSelector("#ctl-mic");
    await guest.click("#reg-join");
    await guest.locator("#passcode").waitFor();
    assert.equal(await guest.inputValue("#name"), "Gus Guest");
    await guest.fill("#passcode", passcode);
    await guest.click("#join");
    // The waiting room is on: the host admits them from the notice.
    await host.locator(".toast").getByRole("button", { name: "Admit" }).click({ timeout: 15_000 });
    await guest.waitForSelector("#ctl-mic");
  });

  await step("the host sees the guest's email and phone; the guest sees only the host", async () => {
    await host.click("#ctl-people");
    await host.locator("[data-contact]", { hasText: "gus@example.com" }).waitFor({ timeout: 15_000 });
    assert.ok(await host.locator("[data-contact]", { hasText: "+1 555 0100" }).isVisible());
    await guest.click("#ctl-people");
    await guest.getByText("The host has hidden the participant list").waitFor();
  });

  await step("the Security menu turns chat and screen sharing off for participants", async () => {
    await host.click("#ctl-security");
    await host.click("#sec-chat-off");
    await host.click("#sec-share");
    await guest.getByText("The host turned off chat").waitFor({ timeout: 10_000 });
    await guest.click("#ctl-chat");
    assert.equal(await guest.locator("#chat-input").isDisabled(), true);
    await guest.click("#ctl-share");
    await guest.getByText("Only the host can share their screen").first().waitFor();
  });

  await step("a poll collects a vote and shares the results", async () => {
    await host.keyboard.press("Escape");
    await host.click("#ctl-polls");
    await host.fill("#poll-question", "Ship on Friday?");
    await host.fill('[data-poll-option="0"]', "Yes");
    await host.fill('[data-poll-option="1"]', "Next week");
    await host.click("#poll-launch");
    await guest.click("#ctl-polls");
    await guest.getByRole("button", { name: "Next week" }).click({ timeout: 10_000 });
    await host.locator("[data-poll]").getByText("1 vote").waitFor({ timeout: 10_000 });
    await host.click("#poll-end");
    await guest.locator("[data-poll]").getByText("Ended").waitFor({ timeout: 10_000 });
  });

  await step("the host makes the guest a co-host", async () => {
    await host.click("#ctl-people");
    await host.getByRole("button", { name: "Make Gus Guest a co-host" }).click();
    await guest.getByText("You're now a co-host").waitFor({ timeout: 10_000 });
    await guest.locator("#ctl-security").waitFor();
  });

  await step("the attendance report has the guest's contact details", async () => {
    await host.click("#ctl-leave");
    await host.click("#menu-end");
    await host.goto(`${BASE}/app/meetings/${code}`);
    await host.getByRole("heading", { name: "Attendance report" }).waitFor();
    assert.ok(await host.locator("table").last().getByText("gus@example.com · +1 555 0100").isVisible());
  });

  console.log(`\nall ${steps.length} steps passed`);
} catch (e) {
  console.error(`\n✗ failed after: ${steps.at(-1) ?? "start"}\n`, e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
