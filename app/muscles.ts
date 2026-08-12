// The registry: every trainable body part, grouped. 10 sets to failure per
// week is the growth floor; 20 is the ceiling before diminishing returns.
export type MuscleKey =
  | "pecs"
  | "delts"
  | "triceps"
  | "lats"
  | "traps"
  | "rotator-cuff"
  | "biceps"
  | "forearms"
  | "hands"
  | "abs"
  | "obliques"
  | "lower-back"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves";

export interface Muscle {
  key: MuscleKey;
  name: string;
  group: "Push" | "Pull" | "Core" | "Legs";
  /** Which body view lights this muscle up. */
  view: "front" | "back";
}

export const MUSCLES: Muscle[] = [
  { key: "pecs", name: "Pecs", group: "Push", view: "front" },
  { key: "delts", name: "Delts", group: "Push", view: "front" },
  { key: "triceps", name: "Triceps", group: "Push", view: "back" },
  { key: "lats", name: "Lats", group: "Pull", view: "back" },
  { key: "traps", name: "Traps", group: "Pull", view: "back" },
  { key: "rotator-cuff", name: "Rotator cuff", group: "Pull", view: "back" },
  { key: "biceps", name: "Biceps", group: "Pull", view: "front" },
  { key: "forearms", name: "Forearms", group: "Pull", view: "front" },
  { key: "hands", name: "Hands & grip", group: "Pull", view: "front" },
  { key: "abs", name: "Abs", group: "Core", view: "front" },
  { key: "obliques", name: "Obliques", group: "Core", view: "front" },
  { key: "lower-back", name: "Lower back", group: "Core", view: "back" },
  { key: "quads", name: "Quads", group: "Legs", view: "front" },
  { key: "hamstrings", name: "Hamstrings", group: "Legs", view: "back" },
  { key: "glutes", name: "Glutes", group: "Legs", view: "back" },
  { key: "calves", name: "Calves", group: "Legs", view: "back" },
];

export const GROUPS = ["Push", "Pull", "Core", "Legs"] as const;

export const FLOOR = 10; // sets/week where growth starts
export const CEILING = 20; // sets/week where diminishing returns start

/** ISO week key (Monday start), e.g. "2026-W33". */
export function weekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Days until the week resets (next Monday). Mon=7 … Sun=1. */
export function daysToReset(d = new Date()): number {
  return 8 - (d.getDay() || 7);
}
