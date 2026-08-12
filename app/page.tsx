"use client";
// tensets — the whole theory of growth in one number. Every body part
// needs 10 sets to failure a week; past 20 the returns diminish. Rows to
// log, a body that lights up, nothing else.
import { useEffect, useMemo, useRef, useState } from "react";
import { BodyFigure } from "./body";
import { CEILING, FLOOR, GROUPS, MUSCLES, MuscleKey, daysToReset, weekKey } from "./muscles";

type Counts = Partial<Record<MuscleKey, number>>;
interface Store {
  weeks: Record<string, Counts>;
  sex: "m" | "f";
}

const LS_KEY = "tensets.v1";

function load(): Store {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {}
  return { weeks: {}, sex: "m" };
}

function prevWeekKey(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 7);
  return weekKey(d);
}

export default function Home() {
  const [store, setStore] = useState<Store | null>(null);
  const [view, setView] = useState<"log" | "body">("log");
  const [side, setSide] = useState<"front" | "back">("front");
  const [flash, setFlash] = useState<MuscleKey | null>(null);
  const rowRefs = useRef<Partial<Record<MuscleKey, HTMLDivElement | null>>>({});

  const wk = weekKey();
  useEffect(() => setStore(load()), []);
  useEffect(() => {
    if (store) localStorage.setItem(LS_KEY, JSON.stringify(store));
  }, [store]);

  const counts: Counts = useMemo(() => store?.weeks[wk] ?? {}, [store, wk]);
  const lastWeek: Counts = useMemo(() => store?.weeks[prevWeekKey()] ?? {}, [store]);

  const bump = (key: MuscleKey, delta: number) => {
    setStore((s) => {
      if (!s) return s;
      const cur = s.weeks[wk]?.[key] ?? 0;
      const next = Math.max(0, cur + delta);
      return { ...s, weeks: { ...s.weeks, [wk]: { ...s.weeks[wk], [key]: next } } };
    });
  };

  const jumpTo = (key: MuscleKey) => {
    setView("log");
    setFlash(key);
    setTimeout(() => {
      rowRefs.current[key]?.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(() => setFlash(null), 1300);
    }, 60);
  };

  if (!store) {
    return (
      <main className="mx-auto max-w-xl px-5 py-10">
        <div className="h-8 w-36 animate-pulse rounded bg-panel" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-panel" />
          ))}
        </div>
      </main>
    );
  }

  const total = MUSCLES.reduce((n, m) => n + (counts[m.key] ?? 0), 0);
  const atGoal = MUSCLES.filter((m) => (counts[m.key] ?? 0) >= FLOOR).length;
  const reset = daysToReset();
  const progress: Partial<Record<MuscleKey, number>> = {};
  for (const m of MUSCLES) progress[m.key] = Math.min((counts[m.key] ?? 0) / FLOOR, 1);

  return (
    <main className="mx-auto max-w-xl px-5 pb-24 pt-8">
      {/* Header */}
      <header className="flex items-end justify-between">
        <div>
          <h1 className="wordmark text-2xl lowercase text-ink">
            ten<span style={{ color: "var(--accent)" }}>sets</span>
          </h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-sub">
            {wk} · resets in {reset} day{reset === 1 ? "" : "s"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-semibold text-ink">
            {atGoal}
            <span className="text-faint">/{MUSCLES.length}</span>
          </p>
          <p className="font-mono text-[11px] uppercase tracking-wider text-sub">parts at 10</p>
        </div>
      </header>

      {/* View toggle */}
      <div className="mt-6 flex items-center justify-between">
        <div className="flex overflow-hidden rounded-full border border-line">
          {(["log", "body"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors"
              style={{
                background: view === v ? "var(--ink)" : "transparent",
                color: view === v ? "var(--bg)" : "var(--sub)",
              }}
            >
              {v}
            </button>
          ))}
        </div>
        {view === "body" ? (
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-full border border-line">
              {(["front", "back"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider"
                  style={{
                    background: side === s ? "var(--panel)" : "transparent",
                    color: side === s ? "var(--ink)" : "var(--sub)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStore((s) => (s ? { ...s, sex: s.sex === "m" ? "f" : "m" } : s))}
              title="Switch figure"
              className="rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-sub hover:text-ink"
            >
              {store.sex === "m" ? "♂" : "♀"}
            </button>
          </div>
        ) : (
          <p className="font-mono text-[11px] text-faint">{total} sets this week</p>
        )}
      </div>

      {total === 0 && view === "log" && (
        <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-sub">
          Fresh week. Every tap of <span className="text-ink">+</span> is one set to failure — get every part to
          10 before Monday.
        </p>
      )}

      {view === "body" ? (
        <section className="mt-6">
          <BodyFigure view={side} sex={store.sex} progress={progress} onPick={jumpTo} />
          <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-wider text-faint">
            dim → lit at 10 sets · tap a muscle to jump to its row
            {side === "front" ? " · triceps, back & rear legs live on the back view" : ""}
          </p>
        </section>
      ) : (
        <section className="mt-6 space-y-7">
          {GROUPS.map((group) => (
            <div key={group}>
              <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">{group}</h2>
              <div className="overflow-hidden rounded-xl border border-line">
                {MUSCLES.filter((m) => m.group === group).map((m, i) => {
                  const n = counts[m.key] ?? 0;
                  const over = n > FLOOR;
                  const scale = over ? CEILING : FLOOR;
                  const pct = Math.min(n / scale, 1) * 100;
                  const last = lastWeek[m.key] ?? 0;
                  return (
                    <div
                      key={m.key}
                      ref={(el) => {
                        rowRefs.current[m.key] = el;
                      }}
                      className={`relative flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""} ${
                        flash === m.key ? "row-flash" : ""
                      }`}
                      style={{ background: "var(--panel)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-medium text-ink">{m.name}</p>
                          <p className="font-mono text-xs text-sub">
                            <span className={n >= FLOOR ? "text-good" : "text-ink"}>{n}</span>
                            <span className="text-faint">/{over ? CEILING : FLOOR}</span>
                            {last > 0 && <span className="ml-2 text-faint">last wk {last}</span>}
                          </p>
                        </div>
                        {/* the bar: 0→10; past 10 it re-scales to 0→20 with a marker at 10 */}
                        <div className="relative mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${pct}%`,
                              background:
                                n >= CEILING
                                  ? "var(--warn)"
                                  : n >= FLOOR
                                    ? "var(--good)"
                                    : `linear-gradient(90deg, var(--accent-2), var(--accent))`,
                              boxShadow: n >= FLOOR && n < CEILING ? "0 0 8px rgba(52,211,153,.5)" : undefined,
                            }}
                          />
                          {over && (
                            <div
                              className="absolute top-0 h-full w-px"
                              style={{ left: "50%", background: "var(--bg)" }}
                              title="10 — the growth floor"
                            />
                          )}
                        </div>
                        {n >= CEILING && (
                          <p className="mt-1 font-mono text-[10px] text-warn">past 20 — diminishing returns</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          aria-label={`Remove a set from ${m.name}`}
                          onClick={() => bump(m.key, -1)}
                          disabled={n === 0}
                          className="flex size-8 items-center justify-center rounded-full border border-line font-mono text-sub transition-colors hover:text-ink disabled:opacity-30"
                        >
                          −
                        </button>
                        <button
                          aria-label={`Log one set to failure on ${m.name}`}
                          title="+1 set to failure"
                          onClick={() => bump(m.key, 1)}
                          className="flex size-8 items-center justify-center rounded-full font-mono font-bold transition-transform active:scale-90"
                          style={{ background: "var(--accent)", color: "#fff" }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      <footer className="mt-12 border-t border-line pt-5">
        <p className="text-xs leading-relaxed text-faint">
          The theory, whole: a muscle grows on ~10 sets to failure a week — fewer and it maintains, past ~20 the
          returns diminish. Weeks reset Monday. Your log lives in this browser; nothing leaves it.
        </p>
      </footer>
    </main>
  );
}
