// Local-only regression. Every external request is mocked or blocked;
// the auth session is synthetic and no real account is created or deleted.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "This mock verification must run locally",
);
const root = fileURLToPath(new URL("../", import.meta.url));
const cfg = parseEnv(readFileSync(resolve(root, ".env.local"), "utf8"));
const api = new URL(cfg.NEXT_PUBLIC_SUPABASE_URL);
const ref = api.hostname.split(".")[0];
const userId = "00000000-0000-4000-8000-000000000001";
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(
    JSON.stringify({
      sub: userId,
      aud: "authenticated",
      role: "authenticated",
      exp: expiresAt,
    }),
  ).toString("base64url"),
  "synthetic-local-test-signature",
].join(".");
const auth = {
  access_token: jwt,
  refresh_token: "synthetic-local-test-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: expiresAt,
  user: {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "mock@example.invalid",
  },
};
const records = {};
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 420, height: 900 },
    timezoneId: "America/Los_Angeles",
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === new URL(base).origin) return route.continue();
    if (url.hostname !== api.hostname) return route.abort();
    const fulfill = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
        },
        body: JSON.stringify(body),
      });
    if (request.method() === "OPTIONS") return fulfill({});
    if (url.pathname === "/auth/v1/user") return fulfill(auth.user);
    if (url.pathname === "/rest/v1/tracker_state") {
      if (request.method() === "GET") {
        const kind = url.searchParams.get("kind")?.replace("eq.", "");
        return fulfill(records[kind] ? [records[kind]] : []);
      }
      if (request.method() === "POST") {
        const row = request.postDataJSON();
        records[row.kind] = row;
        return fulfill([], 201);
      }
    }
    return fulfill({ message: "Unmocked external request blocked" }, 400);
  });
  const page = await context.newPage();
  await page.goto(`${base}/morning`, { waitUntil: "networkidle" });
  const yesterday = await page.evaluate(
    ({ ref, auth }) => {
      localStorage.clear();
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(auth));
      localStorage.setItem(
        "tensets.morning.v1",
        JSON.stringify({ version: 1, days: {} }),
      );
      const date = new Date();
      date.setDate(date.getDate() - 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    },
    { ref, auth },
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("Choose date").fill(yesterday);
  await page.waitForTimeout(1000);
  assert.ok(
    records.morning,
    "Synthetic authenticated morning initializes the mocked backend",
  );
  await page
    .getByRole("button", { name: "Tick Get up immediately", exact: true })
    .click();
  await page.getByRole("link", { name: "Workouts", exact: true }).click();
  await page.waitForURL("**/track");
  await page.waitForTimeout(1400);
  assert.deepEqual(
    records.morning.data.days[yesterday],
    ["up"],
    "Immediate AM → Workouts navigation must flush the last cloud edit",
  );
  await page.getByRole("button", { name: /Start my week/ }).click();
  const today = await page.getByLabel("Choose date").inputValue();
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", {
        name: `Add a set to Pecs on ${today}`,
        exact: true,
      })
      .click();
  await page.getByRole("link", { name: "AM routine", exact: true }).click();
  await page.waitForURL("**/morning");
  await page.waitForTimeout(1400);
  assert.equal(
    records.sets.data.week.counts.pecs,
    3,
    "Rapid workout edits must flush their latest value on navigation",
  );
  assert.deepEqual(
    records.morning.data.days[yesterday],
    ["up"],
    "Workout sync must leave morning data untouched",
  );
  console.log(
    "PASS: immediate navigation in both directions preserves the latest edits in the mocked backend",
  );
} finally {
  await browser.close();
}
