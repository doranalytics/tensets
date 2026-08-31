// Reshot check: the /morning routine tracker exists on the LIVE url,
// ticks persist across reload, and the tracker page links to it.
import { chromium } from "playwright";

const BASE = "https://tensets.fit";
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exit(1);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

// 1. The tracker page carries the link to /morning.
await page.goto(`${BASE}/track`, { waitUntil: "networkidle" });
const amLink = page.locator('a[href="/morning"]');
if ((await amLink.count()) === 0) fail("no /morning link on /track");

// 2. The morning page renders all nine steps in order.
await page.goto(`${BASE}/morning`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Get up immediately");
const labels = [
  "Get up immediately",
  "Make your bed",
  "Cold water on the face",
  "Brush teeth",
  "Drink water",
  "Get sunlight",
  "Get caffeine",
  "Meditate",
  "Workout",
];
for (const l of labels) {
  if ((await page.locator(`text=${l}`).count()) === 0) fail(`missing step: ${l}`);
}

// 3. Tick three boxes; the counter follows.
for (const l of ["Get up immediately", "Make your bed", "Meditate"]) {
  await page.locator("button", { hasText: l }).first().click();
}
await page.waitForTimeout(300);
if ((await page.locator("text=3/9").count()) === 0) fail("counter did not reach 3/9");

// 4. Ticks survive a reload (localStorage).
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("text=Get up immediately");
if ((await page.locator("text=3/9").count()) === 0) fail("ticks lost on reload");

// 5. The back-link lands on the tracker.
await page.locator('a[href="/track"]').first().click();
await page.waitForURL("**/track");

await page.screenshot({ path: "verify/reshot.png", fullPage: true });
await browser.close();
console.log("PASS: /morning live, nine steps present, ticks persist, links work");
