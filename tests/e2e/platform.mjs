// End-to-end: the developer platform through the UI. Needs a running server and Chrome.
//
//   npm run build && npx next start -p 3020 &
//   BASE=http://localhost:3020 node tests/e2e/platform.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3020";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["camera", "microphone", "clipboard-read", "clipboard-write"] });
const page = await ctx.newPage();
page.setDefaultNavigationTimeout(90_000);
page.on("pageerror", (e) => console.error("page error:", e.message));

const steps = [];
const step = async (label, fn) => {
  const t = Date.now();
  await fn();
  steps.push(label);
  console.log(`✓ ${label} (${Date.now() - t} ms)`);
};
const email = `dev-${Date.now()}@example.com`;
let secret, appUrl, code;

try {
  await step("a developer signs up", async () => {
    await page.goto(`${BASE}/signin?mode=signup`);
    await page.fill("#su-name", "Dana Dev");
    await page.fill("#su-email", email);
    await page.fill("#su-password", "correct horse battery");
    await page.click("#su-submit");
    await page.waitForURL(/\/app$/);
  });

  await step("they create an OAuth app and see its secret once", async () => {
    await page.goto(`${BASE}/developers/apps`);
    await page.click("#create-app");
    await page.click("#type-oauth");
    await page.fill("#app-name", "Notes bot");
    await page.check('[data-scope="chat:write"]');
    await page.check('[data-scope="meeting:write"]');
    await page.click("#app-create");
    secret = await page.locator("#new-client-secret").textContent();
    assert.match(secret, /^cvn_cs_/);
    await page.click("#go-to-app");
    await page.waitForURL(/\/developers\/apps\/[0-9a-f]{16}$/);
    appUrl = page.url();
  });

  await step("the install flow shows the consent screen and returns a code", async () => {
    await page.click("#test-install");
    await page.waitForURL(/\/oauth\/authorize/);
    await page.getByText("wants to access your Convene account").waitFor();
    assert.ok(await page.getByText("Post messages into the chat of your live meetings").isVisible());
    await page.click("#consent-allow");
    await page.waitForURL(/\/developers\/callback\?code=/);
  });

  await step("the code exchanges for tokens that call the API", async () => {
    await page.fill("#cb-secret", secret);
    await page.click("#cb-exchange");
    await page.getByText("refresh_token").waitFor();
    await page.click("#cb-me");
    await page.getByText(email).last().waitFor();
  });

  await step("the app shows under Connected apps", async () => {
    await page.goto(`${BASE}/app/connected`);
    await page.getByText("Notes bot").waitFor();
  });

  await step("webhooks reach a test inbox, signed", async () => {
    await page.goto(`${appUrl}`);
    await page.click("#tab-webhooks");
    await page.click("#use-inbox");
    await page.check('[data-event="meeting.created"]');
    await page.click("#save-hook");
    await page.click("#send-test");
    await page.locator("#deliveries").getByText("endpoint.test").waitFor({ timeout: 15_000 });
    await page.locator("#inbox").getByText("Signature verified").waitFor({ timeout: 15_000 });
  });

  await step("the playground creates a meeting through the API", async () => {
    await page.click("#tab-playground");
    await page.click('[data-endpoint="create-meeting"]');
    await page.click("#pg-send");
    await page.locator("#pg-status").getByText("201").waitFor();
    // The example body turns on registration; the next step needs a meeting anyone can walk into.
    code = await page.evaluate(async () => (await (await fetch("/api/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"topic":"Open sync"}' })).json()).code);
    await page.click("#tab-webhooks");
    await page.locator("#deliveries").getByText("meeting.created").first().waitFor({ timeout: 15_000 });
  });

  await step("an app message appears in the live meeting's chat", async () => {
    const call = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["camera", "microphone"] })).newPage();
    await call.goto(`${BASE}/m/${code}`);
    await call.fill("#name", "Guest");
    await call.click("#join");
    await call.waitForSelector("#ctl-mic");
    await page.click("#tab-playground");
    await page.click('[data-endpoint="post-message"]');
    await page.selectOption("#pg-meeting", code);
    await page.click("#pg-send");
    await page.locator("#pg-status").getByText("201").waitFor();
    await call.click("#ctl-chat");
    await call.locator("[data-app-message]").getByText("Reminder: 10 minutes left").waitFor({ timeout: 15_000 });
  });

  console.log(`\nall ${steps.length} steps passed`);
} catch (e) {
  console.error(`\n✗ failed after: ${steps.at(-1) ?? "start"}\n`, e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
