import assert from "node:assert/strict";
import test from "node:test";
import {
  countsForDay,
  replaceDay,
  setDayMuscle,
  undatedSets,
  type Week,
} from "../app/workout-store";

test("editing a saved day includes its pending sets exactly once", () => {
  const week: Week = {
    startedAt: "2026-08-31T10:00:00Z",
    counts: { pecs: 12, lats: 4 },
    days: [{ date: "2026-09-01", counts: { pecs: 3 } }],
    pending: { date: "2026-09-01", counts: { pecs: 2, lats: 4 } },
  };
  assert.deepEqual(countsForDay(week, "2026-09-01"), { pecs: 5, lats: 4 });
  const updated = setDayMuscle(week, "2026-09-01", "pecs", 4);
  assert.deepEqual(updated.counts, { pecs: 11, lats: 4 });
  assert.deepEqual(updated.days, [
    { date: "2026-09-01", counts: { pecs: 4, lats: 4 } },
  ]);
  assert.equal(updated.pending, null);
  assert.equal(undatedSets(updated), 7);
  assert.deepEqual(
    replaceDay(updated, "2026-09-01", countsForDay(updated, "2026-09-01")),
    updated,
  );
});

test("an empty selected day cannot subtract another day's workout", () => {
  const week: Week = {
    startedAt: "2026-08-31T10:00:00Z",
    counts: { pecs: 8 },
    days: [{ date: "2026-09-01", counts: { pecs: 3 } }],
  };
  const updated = setDayMuscle(week, "2026-09-02", "pecs", -1);
  assert.equal(updated.counts.pecs, 8);
  assert.equal(countsForDay(updated, "2026-09-01").pecs, 3);
  assert.equal(countsForDay(updated, "2026-09-02").pecs, 0);
});

test("backfilling a day preserves a different day's pending log and legacy totals", () => {
  const week: Week = {
    startedAt: "2026-08-31T10:00:00Z",
    counts: { pecs: 7, quads: 3 },
    pending: { date: "2026-09-05", counts: { pecs: 2 } },
  };
  const updated = setDayMuscle(week, "2026-09-02", "pecs", 4);
  assert.deepEqual(updated.counts, { pecs: 11, quads: 3 });
  assert.deepEqual(updated.pending, week.pending);
  assert.equal(undatedSets(updated), 8);
  assert.deepEqual(week.counts, { pecs: 7, quads: 3 });
});

test("archived days remain editable, and clearing a day retains the archive and other dates", () => {
  const week: Week = {
    startedAt: "2026-08-24T10:00:00Z",
    endedAt: "2026-08-31T10:00:00Z",
    counts: { pecs: 10, quads: 4 },
    days: [
      { date: "2026-08-25", counts: { pecs: 3, quads: 4 } },
      { date: "2026-08-27", counts: { pecs: 2 } },
    ],
  };
  const updated = replaceDay(week, "2026-08-25", {});
  assert.deepEqual(updated.counts, { pecs: 7, quads: 0 });
  assert.equal(updated.endedAt, week.endedAt);
  assert.deepEqual(countsForDay(updated, "2026-08-27"), { pecs: 2 });
  assert.deepEqual(updated.days?.[0], { date: "2026-08-25", counts: {} });
  assert.equal(undatedSets(updated), 5);
});
