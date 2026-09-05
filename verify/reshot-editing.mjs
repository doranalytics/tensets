import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 420, height: 900 },
  timezoneId: "America/Los_Angeles",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const dates = await page.evaluate(() => {
  const key = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  return {
    today: key(0),
    yesterday: key(-1),
    before: key(-2),
    start: key(-6),
    oldStart: key(-20),
    oldEnd: key(-14),
    older: key(-45),
  };
});
const morningKeys = [
  "up",
  "bed",
  "cold",
  "teeth",
  "water",
  "sun",
  "caffeine",
  "meditate",
  "workout",
];
const seed = {
  version: 2,
  sex: "m",
  theme: "dark",
  week: {
    startedAt: `${dates.start}T12:00:00-07:00`,
    counts: { pecs: 12, lats: 4 },
    days: [
      { date: dates.yesterday, counts: { pecs: 3 } },
      { date: dates.before, counts: { lats: 4 } },
    ],
    pending: { date: dates.today, counts: { pecs: 2 } },
  },
  history: [
    {
      startedAt: `${dates.oldStart}T12:00:00-07:00`,
      endedAt: `${dates.oldEnd}T12:00:00-07:00`,
      counts: { pecs: 5 },
      days: [{ date: dates.oldEnd, counts: { pecs: 5 } }],
    },
  ],
};
const store = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("tensets.v1")));
const morning = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("tensets.morning.v1")));
const selectDate = async (date) => {
  await page.getByLabel("Choose date", { exact: true }).fill(date);
  await page.getByLabel("Choose date", { exact: true }).blur();
};
try {
  await page.goto(`${base}/track`);
  await page.getByRole("heading", { name: "Your training." }).waitFor();
  await page.evaluate(
    ({ seed, dates, morningKeys }) => {
      localStorage.setItem("tensets.v1", JSON.stringify(seed));
      localStorage.setItem(
        "tensets.morning.v1",
        JSON.stringify({
          version: 1,
          days: {
            [dates.today]: ["up"],
            [dates.yesterday]: morningKeys,
            [dates.before]: morningKeys,
          },
        }),
      );
    },
    { seed, dates, morningKeys },
  );
  await page.reload();
  await page.getByLabel("Choose date", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByLabel("Pecs selected day sets", { exact: true })
      .innerText(),
    "2",
  );
  await selectDate(dates.yesterday);
  assert.equal(
    await page
      .getByLabel("Pecs selected day sets", { exact: true })
      .innerText(),
    "3",
  );
  await page
    .getByRole("button", {
      name: `Add a set to Pecs on ${dates.yesterday}`,
      exact: true,
    })
    .click();
  let data = await store();
  assert.equal(data.week.counts.pecs, 13);
  assert.equal(
    data.week.days.find((d) => d.date === dates.yesterday).counts.pecs,
    4,
  );
  assert.equal(data.week.pending.counts.pecs, 2);
  for (let i = 0; i < 4; i++)
    await page
      .getByRole("button", {
        name: `Remove a set from Pecs on ${dates.yesterday}`,
        exact: true,
      })
      .click();
  assert.equal((await store()).week.counts.pecs, 9);
  assert.equal(
    await page
      .getByRole("button", {
        name: `Remove a set from Pecs on ${dates.yesterday}`,
        exact: true,
      })
      .isDisabled(),
    true,
  );
  await selectDate(dates.today);
  assert.equal(
    await page
      .getByLabel("Pecs selected day sets", { exact: true })
      .innerText(),
    "2",
  );
  await selectDate(dates.start);
  await page.getByRole("button", { name: "Log rest day", exact: true }).click();
  assert.ok((await store()).week.days.some((d) => d.date === dates.start));
  await page.reload();
  await page.getByLabel("Choose date", { exact: true }).waitFor();
  assert.equal((await store()).week.counts.pecs, 9);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("button", { name: /Edit days/ })
    .first()
    .click();
  assert.equal(
    await page.getByLabel("Choose date", { exact: true }).inputValue(),
    dates.oldEnd,
  );
  await page
    .getByRole("button", {
      name: `Add a set to Pecs on ${dates.oldEnd}`,
      exact: true,
    })
    .click();
  data = await store();
  assert.equal(data.history[0].counts.pecs, 6);
  assert.equal(data.week.counts.pecs, 9);
  await page.getByRole("button", { name: /Current week/ }).click();
  await page
    .getByRole("button", {
      name: `Add a set to Pecs on ${dates.today}`,
      exact: true,
    })
    .click();
  assert.equal((await store()).week.counts.pecs, 10);
  await mkdir("verify", { recursive: true });
  await page.screenshot({ path: "verify/reshot.png", fullPage: true });
  await page.getByRole("link", { name: "AM routine", exact: true }).click();
  await page.waitForURL("**/morning");
  await page
    .getByRole("button", { name: "Untick Get up immediately", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("progressbar", { name: "Morning completion" })
      .getAttribute("aria-valuenow"),
    "1",
  );
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  assert.equal(
    await page
      .getByRole("progressbar", { name: "Morning completion" })
      .getAttribute("aria-valuenow"),
    "9",
  );
  await page
    .getByRole("button", { name: "Untick Drink water", exact: true })
    .click();
  assert.equal((await morning()).days[dates.yesterday].length, 8);
  assert.deepEqual((await morning()).days[dates.today], ["up"]);
  await page
    .getByRole("button", { name: "Tick Drink water", exact: true })
    .click();
  await selectDate(dates.older);
  await page
    .getByRole("button", { name: "Tick Meditate", exact: true })
    .click();
  assert.deepEqual((await morning()).days[dates.older], ["meditate"]);
  await page.getByRole("button", { name: /Back to today/ }).click();
  assert.equal(
    await page.getByLabel("Choose date", { exact: true }).inputValue(),
    dates.today,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Next day", exact: true })
      .isDisabled(),
    true,
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Untick Get up immediately", exact: true })
    .waitFor();
  assert.equal((await morning()).days[dates.yesterday].length, 9);
  assert.deepEqual((await morning()).days[dates.older], ["meditate"]);
  await page.screenshot({ path: "verify/reshot-morning.png", fullPage: true });
  await page
    .getByRole("button", { name: "Toggle light / dark", exact: true })
    .click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.getByRole("link", { name: "Workouts", exact: true }).click();
  await page.waitForURL("**/track");
  await page.getByLabel("Choose date", { exact: true }).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.waitForTimeout(350);
  await page.screenshot({ path: "verify/reshot-light.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 780 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "320px workout overflow",
  );
  await page.getByRole("link", { name: "AM routine", exact: true }).click();
  await page.waitForURL("**/morning");
  await page.getByLabel("Choose date", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "320px AM overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: current and archived workout edits; pending and legacy preservation; AM dates; reload; theme; 320px layout.",
  );
} finally {
  await context.close();
  await browser.close();
}
