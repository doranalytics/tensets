// Reshot check: Supabase backend + login on the LIVE url. Device A
// creates an account and logs data on both trackers; device B (a fresh
// browser context, empty localStorage) signs in and must see all of it —
// proof the backend holds the full session data for sets and mornings.
import { chromium } from "playwright";

const BASE = "https://tensets.fit";
const EMAIL = `verify-${Date.now()}@tensets.fit`;
const PASSWORD = `vfy-${Math.random().toString(36).slice(2, 12)}A1!`;
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exit(1);
};

const browser = await chromium.launch();

// ---- Device A: create the account, log everything ----
const a = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();

await a.goto(`${BASE}/account`, { waitUntil: "networkidle" });
await a.fill("#email", EMAIL);
await a.fill("#password", PASSWORD);
await a.click("text=create account");
await a.waitForSelector("text=signed in as", { timeout: 15000 }).catch(() => fail("signup did not sign in"));

// Sets: start a week, log 3 sets on the first muscle.
await a.goto(`${BASE}/track`, { waitUntil: "networkidle" });
await a.click("text=start my week");
const plus = a.locator('button[title="+1 set to failure"]').first();
for (let i = 0; i < 3; i++) await plus.click();
await a.waitForTimeout(1600); // debounce + push

// Mornings: tick two boxes.
await a.goto(`${BASE}/morning`, { waitUntil: "networkidle" });
await a.waitForSelector("text=Get up immediately");
await a.locator("button", { hasText: "Get up immediately" }).first().click();
await a.locator("button", { hasText: "Drink water" }).first().click();
await a.waitForTimeout(1600);
if ((await a.locator("text=2/9").count()) === 0) fail("device A morning count wrong");

// ---- Device B: fresh context, sign in, expect everything ----
const b = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();
await b.goto(`${BASE}/account`, { waitUntil: "networkidle" });
await b.fill("#email", EMAIL);
await b.fill("#password", PASSWORD);
await b.click("text=sign in");
await b.waitForSelector("text=signed in as", { timeout: 15000 }).catch(() => fail("device B sign-in failed"));

// Sets came down: the first muscle shows 3, and a week is running.
await b.goto(`${BASE}/track`, { waitUntil: "networkidle" });
await b.waitForSelector("text=week of", { timeout: 15000 }).catch(() => fail("device B has no running week"));
await b.waitForTimeout(1000);
const rowText = await b.locator("main").innerText();
if (!/3\s*\/\s*10/.test(rowText.replace(/\n/g, " "))) fail("device B did not receive the 3 logged sets");

// Mornings came down: 2/9 with the same two boxes ticked.
await b.goto(`${BASE}/morning`, { waitUntil: "networkidle" });
await b.waitForSelector("text=Get up immediately");
await b.waitForTimeout(1200);
if ((await b.locator("text=2/9").count()) === 0) fail("device B did not receive the morning ticks");

await b.screenshot({ path: "verify/reshot.png", fullPage: true });
await browser.close();
console.log(`PASS: backend holds sets + mornings; login works (${EMAIL})`);
