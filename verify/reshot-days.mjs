// Reshot check: per-day saving on the LIVE url. Log sets, hit "save day",
// see the day chip on the chart; tick a morning box, see the saved stamp.
// The account created here is then checked directly in the backend (see
// the runner) to prove the per-day data reached Supabase.
import { chromium } from "playwright";

const BASE = "https://tensets.fit";
const EMAIL = process.argv[2];
const PASSWORD = process.argv[3];
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exit(1);
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();

// Sign up so everything pushes to the backend.
await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
await page.fill("#email", EMAIL);
await page.fill("#password", PASSWORD);
await page.click("text=create account");
await page.waitForSelector("text=signed in as", { timeout: 15000 }).catch(() => fail("signup failed"));

// Sets: start a week, log 4 sets → "unsaved" chip appears.
await page.goto(`${BASE}/track`, { waitUntil: "networkidle" });
await page.click("text=start my week");
const plus = page.locator('button[title="+1 set to failure"]').first();
for (let i = 0; i < 4; i++) await plus.click();
await page.waitForSelector("text=4 unsaved", { timeout: 5000 }).catch(() => fail("no unsaved chip after logging"));

// Save the day → chip files onto the chart, button confirms.
await page.click("text=save day · 4");
await page.waitForSelector("text=day saved ✓", { timeout: 5000 }).catch(() => fail("save day gave no confirmation"));
await page.waitForTimeout(400);
if ((await page.locator("text=4 unsaved").count()) > 0) fail("unsaved chip still there after save");
const chipCount = await page.locator("section >> text=/^(mon|tue|wed|thu|fri|sat|sun) \\d+/").count();
if (chipCount === 0) fail("no saved day chip on the chart");

// Chips survive a reload.
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("text=day by day", { timeout: 10000 });
if ((await page.locator("text=/^(mon|tue|wed|thu|fri|sat|sun) \\d+/").count()) === 0)
  fail("day chip lost on reload");
await page.waitForTimeout(1600); // let the push land
await page.screenshot({ path: "verify/reshot.png", fullPage: true });

// Morning: one tick shows the per-day saved stamp.
await page.goto(`${BASE}/morning`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Get up immediately");
await page.locator("button", { hasText: "Get up immediately" }).first().click();
await page.waitForSelector("text=/saved to (mon|tue|wed|thu|fri|sat|sun)/", { timeout: 5000 }).catch(() =>
  fail("morning saved-stamp missing"),
);
await page.waitForTimeout(1600);

await browser.close();
console.log("PASS: save day files chips, morning stamps the day");
