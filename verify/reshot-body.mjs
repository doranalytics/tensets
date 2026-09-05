import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 420, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`${base}/track`);
  await page.getByRole("heading", { name: "Your training." }).waitFor();
  await page.evaluate(() =>
    localStorage.setItem(
      "tensets.v1",
      JSON.stringify({
        version: 2,
        sex: "m",
        theme: "dark",
        week: {
          startedAt: new Date().toISOString(),
          counts: { pecs: 23, lats: 10, quads: 5, abs: 8, triceps: 6 },
        },
        history: [],
      }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: "Body map", exact: true }).click();
  await page.getByRole("button", { name: /^back$/i }).waitFor();
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent.trim().toLowerCase() === "back",
      )?.disabled,
  );
  await page
    .getByRole("button", { name: /^back$/i })
    .scrollIntoViewIfNeeded();
  await mkdir("verify", { recursive: true });
  await page.screenshot({ path: "verify/reshot-body.png", fullPage: true });
  assert.equal(
    await page
      .getByRole("option", { name: "Pecs · 23 sets", exact: true })
      .count(),
    1,
    "Body labels preserve actual totals above 20",
  );
  await page.getByRole("button", { name: /^back$/i }).click();
  assert.equal(
    await page
      .getByRole("button", { name: /^back$/i })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.screenshot({
    path: "verify/reshot-body-back.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /^front$/i }).click();
  const canvas = page.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.48);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width * 0.68,
    rect.y + rect.height * 0.48,
    { steps: 8 },
  );
  await page.mouse.up();
  assert.equal(
    await page
      .getByRole("button", { name: /^front$/i })
      .getAttribute("aria-pressed"),
    "false",
    "Drag rotates into free view",
  );
  await page.getByRole("button", { name: /^front$/i }).click();
  await canvas.scrollIntoViewIfNeeded();
  const front = await canvas.boundingBox();
  await page.mouse.click(
    front.x + front.width * 0.54,
    front.y + front.height * 0.27,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Daily log", exact: true })
      .getAttribute("aria-pressed"),
    "true",
    "Tapping chest opens daily log",
  );
  await page.getByRole("button", { name: "Body map", exact: true }).click();
  await page
    .getByLabel("Choose a muscle to open its log")
    .selectOption("quads");
  assert.equal(
    await page
      .getByRole("button", { name: "Daily log", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Body map", exact: true }).click();
  await page
    .getByRole("button", { name: "Switch body figure", exact: true })
    .click();
  assert.match(
    await page
      .getByRole("button", { name: "Switch body figure", exact: true })
      .innerText(),
    /Female/,
  );
  await page
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent.trim().toLowerCase() === "back",
      )?.disabled,
  );
  await page
    .getByRole("button", { name: /^back$/i })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "verify/reshot-body-light.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 780 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "Body mobile overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: body loads, front/back rotate, drag works, chest tap and accessible muscle selector open logs, exact 23-set label, alternate figure, light mode and 320px width.",
  );
} finally {
  await browser.close();
}
