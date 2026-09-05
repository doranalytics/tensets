// Two fresh browser contexts exercise dated edits against the real backend.
// Every run owns one uniquely named account and deletes it in finally.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  inspectDisposable,
  readDisposableStates,
  deleteDisposable,
} from "./disposable-account.mjs";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.BASE_URL ?? "https://tensets.fit";
const email = `verify-reshot-edits-${randomUUID()}@tensets.fit`;
const password = `${randomBytes(24).toString("base64url")}A1!`;
assert.equal(
  inspectDisposable(email),
  null,
  "Read-only DB preflight and unique account check",
);
let browser;
let userId;
let failure;

async function eventually(check, message) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await check()) return;
    await delay(400);
  }
  throw new Error(message);
}

async function go(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
}

try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const contextOptions = {
    viewport: { width: 420, height: 900 },
    timezoneId: "America/Los_Angeles",
  };
  const contextA = await browser.newContext(contextOptions);
  const a = await contextA.newPage();
  await go(a, "/account");
  // Fixture represents an existing user's week with two dated workouts.
  // All changes under test below are made using the actual production UI.
  const { today, yesterday } = await a.evaluate(() => {
    const key = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const now = new Date();
    const prior = new Date(now);
    prior.setDate(prior.getDate() - 1);
    const started = new Date(prior);
    started.setDate(started.getDate() - 1);
    const today = key(now),
      yesterday = key(prior);
    localStorage.setItem(
      "tensets.v1",
      JSON.stringify({
        version: 2,
        sex: "m",
        theme: "dark",
        history: [],
        week: {
          startedAt: started.toISOString(),
          counts: { pecs: 5 },
          days: [
            { date: yesterday, counts: { pecs: 2 } },
            { date: today, counts: { pecs: 3 } },
          ],
        },
      }),
    );
    localStorage.setItem(
      "tensets.morning.v1",
      JSON.stringify({ version: 1, days: {} }),
    );
    return { today, yesterday };
  });
  await a.locator("#email").fill(email);
  await a.locator("#password").fill(password);
  await a.getByRole("button", { name: "create account", exact: true }).click();
  await a
    .getByText("signed in as", { exact: true })
    .waitFor({ timeout: 15000 });
  userId = inspectDisposable(email)?.id;
  assert.ok(userId, "Created account can be identified for guaranteed cleanup");
  const states = () => readDisposableStates(email, userId);
  console.log(
    "PASS: isolated account created; cleanup UUID recorded in memory",
  );

  await go(a, "/track");
  await a.getByLabel("Choose date").fill(yesterday);
  await a
    .getByRole("button", {
      name: `Add a set to Pecs on ${yesterday}`,
      exact: true,
    })
    .click();
  await a.getByLabel("Choose date").fill(today);
  await a
    .getByRole("button", { name: `Add a set to Pecs on ${today}`, exact: true })
    .click();
  await eventually(
    () => states().sets?.week?.counts.pecs === 7,
    "Workout date edits did not reach backend",
  );
  assert.deepEqual(
    states().sets.week.days.map((d) => [d.date, d.counts.pecs]),
    [
      [yesterday, 3],
      [today, 4],
    ],
  );
  console.log("PASS: workout edits persisted to separate days in backend");

  await go(a, "/morning");
  await a.getByLabel("Choose date").fill(yesterday);
  await eventually(
    () => !!states().morning,
    "Morning store did not initialize in backend",
  );
  await a
    .getByRole("button", { name: "Tick Get up immediately", exact: true })
    .click();
  // Regression: changing trackers immediately must not cancel the last edit.
  await a.getByRole("link", { name: "Workouts", exact: true }).click();
  await a.waitForURL("**/track");
  await eventually(
    () => states().morning?.days?.[yesterday]?.includes("up"),
    "Immediate AM → Workouts navigation lost the cloud push",
  );
  console.log(
    "PASS: immediate tracker navigation retains the past-day cloud edit",
  );

  await go(a, "/morning");
  await a
    .getByRole("button", { name: "Tick Drink water", exact: true })
    .click();
  await eventually(
    () => states().morning?.days?.[today]?.includes("water"),
    "Today's morning edit did not reach backend",
  );
  assert.deepEqual(states().morning.days, {
    [yesterday]: ["up"],
    [today]: ["water"],
  });

  const contextB = await browser.newContext(contextOptions);
  const b = await contextB.newPage();
  await go(b, "/account");
  await b.locator("#email").fill(email);
  await b.locator("#password").fill(password);
  await b.getByRole("button", { name: "sign in", exact: true }).click();
  await b
    .getByText("signed in as", { exact: true })
    .waitFor({ timeout: 15000 });
  await go(b, "/track");
  await eventually(
    () =>
      b
        .getByLabel("Pecs selected day sets", { exact: true })
        .textContent()
        .then((v) => v === "4"),
    "Fresh browser did not restore today's workout",
  );
  await b.getByLabel("Choose date").fill(yesterday);
  assert.equal(
    await b.getByLabel("Pecs selected day sets", { exact: true }).textContent(),
    "3",
  );
  await b
    .getByRole("button", {
      name: `Remove a set from Pecs on ${yesterday}`,
      exact: true,
    })
    .click();
  await eventually(
    () => states().sets?.week?.counts.pecs === 6,
    "Second browser's workout correction did not sync",
  );
  await go(b, "/morning");
  await b
    .getByRole("button", { name: "Untick Drink water", exact: true })
    .waitFor();
  await b.getByLabel("Choose date").fill(yesterday);
  await b
    .getByRole("button", { name: "Untick Get up immediately", exact: true })
    .click();
  await eventually(
    () => states().morning?.days?.[yesterday]?.length === 0,
    "Second browser's past morning correction did not sync",
  );
  assert.deepEqual(states().morning.days[today], ["water"]);
  console.log(
    "PASS: fresh browser restores both dates and corrections sync independently",
  );

  await go(a, "/track");
  await a.getByLabel("Choose date").fill(yesterday);
  await eventually(
    () =>
      a
        .getByLabel("Pecs selected day sets", { exact: true })
        .textContent()
        .then((v) => v === "2"),
    "First browser did not restore corrected workout",
  );
  await go(a, "/morning");
  await a.getByLabel("Choose date").fill(yesterday);
  await a
    .getByRole("button", { name: "Tick Get up immediately", exact: true })
    .waitFor();
  await a.getByRole("button", { name: /Back to today/ }).click();
  await a
    .getByRole("button", { name: "Untick Drink water", exact: true })
    .waitFor();
  console.log(
    "PASS: corrections round-trip back to the first browser; today is unchanged",
  );
} catch (error) {
  failure = error;
} finally {
  await browser?.close();
  const account = inspectDisposable(email);
  if (account) {
    if (userId && userId !== account.id)
      throw new Error("Cleanup UUID mismatch");
    const result = deleteDisposable(email, account.id);
    assert.equal(result.remainingTrackerRows, 0);
    console.log("PASS: disposable account deleted; no tracker rows remain");
  } else {
    console.log("PASS: no disposable account remains");
  }
}
if (failure) throw failure;
console.log(`PASS: dated workout and AM cloud editing verified on ${base}`);
