// Smoke test for a packaged build: start the app, check that Convene's home page loads in its window,
// and that links to other sites don't open inside it. CI runs it on Linux under xvfb.
//
//   node smoke.mjs dist/linux-unpacked/convene
import assert from "node:assert/strict";
import { _electron as electron } from "playwright-core";

const executablePath = process.argv[2];
assert(executablePath, "pass the path to the packaged app's executable");

const app = await electron.launch({ executablePath, args: ["--no-sandbox"], timeout: 60_000 });
try {
  const page = await app.firstWindow();
  await page.waitForSelector("#new-meeting", { timeout: 60_000 });
  assert.match(page.url(), /^https:\/\/convene-meet\.netlify\.app\/?$/);
  assert.match(await page.evaluate(() => navigator.userAgent), /ConveneDesktop\/\d/);
  console.log("✓ the home page loads in the app window");

  await page.evaluate(() => window.open("https://github.com/amanjhacodes55/convene"));
  await page.waitForTimeout(1000);
  assert.equal(app.windows().length, 1, "outside links should open in the browser, not a new window");
  assert.match(page.url(), /convene-meet\.netlify\.app/);
  console.log("✓ outside links stay out of the app");
} finally {
  await app.close();
}
