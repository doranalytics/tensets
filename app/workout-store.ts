import type { MuscleKey } from "./muscles";

export type Counts = Partial<Record<MuscleKey, number>>;
export interface DayLog {
  date: string;
  counts: Counts;
}
export interface Week {
  startedAt: string;
  endedAt?: string;
  counts: Counts;
  days?: DayLog[];
  pending?: DayLog | null;
}
export interface WorkoutStore {
  version: 2;
  sex: "m" | "f";
  theme: "dark" | "light";
  week: Week | null;
  history: Week[];
}

export function totalSets(counts: Counts): number {
  return Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
}

function addCounts(target: Counts, source: Counts) {
  for (const [key, value] of Object.entries(source)) {
    const muscle = key as MuscleKey;
    target[muscle] = (target[muscle] ?? 0) + (value ?? 0);
  }
}

/** Include older unsaved entries in their original day, without moving them. */
export function countsForDay(week: Week, date: string): Counts {
  const counts: Counts = {};
  for (const day of week.days ?? []) {
    if (day.date === date) addCounts(counts, day.counts);
  }
  if (week.pending?.date === date) addCounts(counts, week.pending.counts);
  return counts;
}

/**
 * Replace one day's values and adjust totals by that day's delta. Rebuilding
 * totals from days would erase legacy sets logged before day tracking existed.
 */
export function replaceDay(week: Week, date: string, next: Counts): Week {
  const previous = countsForDay(week, date);
  const counts = { ...week.counts };
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    const muscle = key as MuscleKey;
    counts[muscle] = Math.max(
      0,
      (counts[muscle] ?? 0) + (next[muscle] ?? 0) - (previous[muscle] ?? 0),
    );
  }
  return {
    ...week,
    counts,
    days: [
      ...(week.days ?? []).filter((day) => day.date !== date),
      { date, counts: next },
    ].sort((a, b) => a.date.localeCompare(b.date)),
    pending: week.pending?.date === date ? null : week.pending,
  };
}

export function setDayMuscle(
  week: Week,
  date: string,
  key: MuscleKey,
  value: number,
): Week {
  return replaceDay(week, date, {
    ...countsForDay(week, date),
    [key]: Math.max(0, Math.round(value)),
  });
}

export function undatedSets(week: Week): number {
  const dated: Counts = {};
  for (const day of week.days ?? []) addCounts(dated, day.counts);
  if (week.pending) addCounts(dated, week.pending.counts);
  return Object.entries(week.counts).reduce(
    (sum, [key, count]) =>
      sum + Math.max(0, (count ?? 0) - (dated[key as MuscleKey] ?? 0)),
    0,
  );
}

export function loggedDates(week: Week): string[] {
  return [
    ...new Set([
      ...(week.days ?? []).map((day) => day.date),
      ...(week.pending ? [week.pending.date] : []),
    ]),
  ].sort();
}
