// The registry: every trainable body part, grouped. 10 sets to failure per
// week is the growth floor; 20 is the ceiling before diminishing returns.
// Delts are tracked per head — front, side, rear — because they grow (and
// lag) independently.
export type MuscleKey =
  | "pecs"
  | "front-delts"
  | "side-delts"
  | "rear-delts"
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
}

export const MUSCLES: Muscle[] = [
  { key: "pecs", name: "Pecs", group: "Push" },
  { key: "front-delts", name: "Front delts", group: "Push" },
  { key: "side-delts", name: "Side delts", group: "Push" },
  { key: "rear-delts", name: "Rear delts", group: "Pull" },
  { key: "triceps", name: "Triceps", group: "Push" },
  { key: "lats", name: "Lats", group: "Pull" },
  { key: "traps", name: "Traps", group: "Pull" },
  { key: "rotator-cuff", name: "Rotator cuff", group: "Pull" },
  { key: "biceps", name: "Biceps", group: "Pull" },
  { key: "forearms", name: "Forearms", group: "Pull" },
  { key: "hands", name: "Hands & grip", group: "Pull" },
  { key: "abs", name: "Abs", group: "Core" },
  { key: "obliques", name: "Obliques", group: "Core" },
  { key: "lower-back", name: "Lower back", group: "Core" },
  { key: "quads", name: "Quads", group: "Legs" },
  { key: "hamstrings", name: "Hamstrings", group: "Legs" },
  { key: "glutes", name: "Glutes", group: "Legs" },
  { key: "calves", name: "Calves", group: "Legs" },
];

export const GROUPS = ["Push", "Pull", "Core", "Legs"] as const;

export const FLOOR = 10; // sets/week where growth starts
export const CEILING = 20; // sets/week where diminishing returns start
