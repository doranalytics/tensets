"use client";
// The body — a faceless, translucent wireframe figure. Each muscle region
// lights up with the week's progress (0 → 10 sets = dim → full glow).
// Regions are clickable; the parent jumps to that muscle's row.
// One side is authored; the other is mirrored, so the figure stays
// perfectly symmetric. A sex toggle reshapes shoulders and hips.
import { MuscleKey } from "./muscles";

type Region = { key: MuscleKey; d: string; mirror?: boolean };

// ---- FRONT view regions (left side where mirrored) ----
const FRONT: Region[] = [
  { key: "delts", d: "M62,82 C52,78 42,82 39,92 C37,100 42,106 50,106 C58,105 64,98 65,88 Z", mirror: true },
  { key: "pecs", d: "M98,88 C82,86 68,92 65,102 C63,114 74,122 90,123 L98,122 Z", mirror: true },
  { key: "biceps", d: "M40,108 C33,112 30,124 31,138 C32,148 36,152 42,150 C48,147 50,132 48,118 C46,110 44,106 40,108 Z", mirror: true },
  { key: "forearms", d: "M31,152 C26,160 22,178 22,192 C22,200 26,204 31,202 C36,199 39,184 39,168 C39,158 36,150 31,152 Z", mirror: true },
  { key: "hands", d: "M21,206 C17,210 15,220 17,228 C19,234 25,235 28,230 C31,225 30,213 27,207 C25,203 23,203 21,206 Z", mirror: true },
  { key: "abs", d: "M89,128 C84,128 82,132 82,138 L82,186 C82,194 86,199 94,200 L100,200 L100,128 Z", mirror: true },
  { key: "obliques", d: "M78,132 C72,134 68,140 68,150 L69,182 C70,190 74,194 79,192 C80,184 79,144 78,132 Z", mirror: true },
  { key: "quads", d: "M70,208 C63,214 60,236 61,262 C62,286 68,302 78,306 C88,302 92,282 92,254 C92,228 88,212 82,206 C78,204 74,205 70,208 Z", mirror: true },
];

// ---- BACK view regions ----
const BACK: Region[] = [
  { key: "traps", d: "M100,64 L82,74 C74,80 70,88 72,96 L88,110 L100,112 Z", mirror: true },
  { key: "rotator-cuff", d: "M70,100 C63,102 59,108 60,116 C61,122 66,125 72,123 C77,120 79,112 77,105 C75,100 73,99 70,100 Z", mirror: true },
  { key: "lats", d: "M96,116 C84,116 72,122 68,132 C65,144 72,160 84,172 C92,179 98,181 100,180 L100,118 Z", mirror: true },
  { key: "lower-back", d: "M88,158 C85,160 84,166 84,174 L84,196 C84,202 90,206 100,206 L100,158 Z", mirror: true },
  { key: "triceps", d: "M42,106 C34,108 30,118 30,132 C30,144 34,151 41,150 C47,148 50,136 49,122 C48,111 46,105 42,106 Z", mirror: true },
  { key: "glutes", d: "M76,208 C67,212 63,222 64,234 C65,244 72,250 84,250 C94,250 99,244 100,236 L100,210 C92,206 83,205 76,208 Z", mirror: true },
  { key: "hamstrings", d: "M66,256 C63,268 63,288 66,304 C69,316 76,322 84,320 C92,317 95,300 94,278 C93,264 90,256 84,254 C78,252 70,252 66,256 Z", mirror: true },
  { key: "calves", d: "M70,330 C66,338 65,354 67,370 C69,382 75,388 81,386 C87,383 89,368 88,352 C87,340 83,332 78,328 C75,326 72,327 70,330 Z", mirror: true },
];

// The still outline: head, torso, arms, legs — one silhouette per view.
const OUTLINE_FRONT =
  "M100,18 C88,18 80,26 80,38 C80,46 84,53 90,56 L90,64 C76,68 64,74 58,80 C46,84 38,92 34,104 C28,122 24,152 22,190 C21,206 18,222 16,230 M100,18 C112,18 120,26 120,38 C120,46 116,53 110,56 L110,64 C124,68 136,74 142,80 C154,84 162,92 166,104 C172,122 176,152 178,190 C179,206 182,222 184,230 M62,84 C58,120 58,156 62,186 C64,200 66,206 64,214 C58,244 56,276 60,304 C62,320 66,342 64,362 C63,378 64,392 66,400 M138,84 C142,120 142,156 138,186 C136,200 134,206 136,214 C142,244 144,276 140,304 C138,320 134,342 136,362 C137,378 136,392 134,400 M100,124 L100,204 M84,214 C92,210 108,210 116,214";
const OUTLINE_BACK = OUTLINE_FRONT;

// A few faint facet lines for the wireframe feel.
const FACETS =
  "M65,100 L100,124 L135,100 M65,140 L100,124 M135,140 L100,124 M82,206 L100,180 L118,206 M70,260 L92,254 M130,260 L108,254";

export function BodyFigure({
  view,
  sex,
  progress,
  onPick,
}: {
  view: "front" | "back";
  sex: "m" | "f";
  /** 0..1 per muscle (sets / FLOOR, capped). */
  progress: Partial<Record<MuscleKey, number>>;
  onPick: (key: MuscleKey) => void;
}) {
  const regions = view === "front" ? FRONT : BACK;
  // Sex reshaping: narrower shoulders + wider hips for the f figure.
  const upper = sex === "f" ? 0.92 : 1;
  const lower = sex === "f" ? 1.07 : 1;

  const renderRegion = (r: Region, mirrored: boolean) => {
    const p = progress[r.key] ?? 0;
    const lit = p >= 1;
    return (
      <path
        key={`${r.key}${mirrored ? "-m" : ""}`}
        d={r.d}
        transform={mirrored ? "translate(200,0) scale(-1,1)" : undefined}
        fill={lit ? "var(--good)" : "var(--accent)"}
        fillOpacity={0.08 + p * 0.55}
        stroke={lit ? "var(--good)" : "var(--accent)"}
        strokeOpacity={0.25 + p * 0.6}
        strokeWidth={1}
        className={lit ? "glow" : undefined}
        style={{ cursor: "pointer", transition: "fill-opacity .3s, stroke-opacity .3s" }}
        onClick={() => onPick(r.key)}
      >
        <title>{r.key.replace("-", " ")}</title>
      </path>
    );
  };

  return (
    <svg viewBox="0 0 200 420" className="mx-auto block h-full max-h-[62vh] w-auto" aria-label={`${view} of the body`}>
      {/* silhouette */}
      <g transform={`translate(100 0) scale(${upper} 1) translate(-100 0)`}>
        <path
          d={view === "front" ? OUTLINE_FRONT : OUTLINE_BACK}
          fill="none"
          stroke="var(--line)"
          strokeWidth={1.6}
        />
        <path d={FACETS} fill="none" stroke="var(--line)" strokeWidth={0.6} opacity={0.7} />
        {/* head — faceless on purpose */}
        <circle cx={100} cy={38} r={20} fill="var(--panel)" stroke="var(--line)" strokeWidth={1.6} />
      </g>

      {/* upper-body regions */}
      <g transform={`translate(100 0) scale(${upper} 1) translate(-100 0)`}>
        {regions
          .filter((r) => !["quads", "hamstrings", "glutes", "calves"].includes(r.key))
          .map((r) => (
            <g key={r.key}>
              {renderRegion(r, false)}
              {r.mirror && renderRegion(r, true)}
            </g>
          ))}
      </g>

      {/* lower-body regions */}
      <g transform={`translate(100 0) scale(${lower} 1) translate(-100 0)`}>
        {regions
          .filter((r) => ["quads", "hamstrings", "glutes", "calves"].includes(r.key))
          .map((r) => (
            <g key={r.key}>
              {renderRegion(r, false)}
              {r.mirror && renderRegion(r, true)}
            </g>
          ))}
      </g>
    </svg>
  );
}
