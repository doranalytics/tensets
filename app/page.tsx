"use client";
// tensets — 10 sets to failure per body part per week; past 20 the returns
// diminish. Rows to log, a 3D body that lights up, weeks you start
// yourself. No aggregate vanity numbers: the only stat that matters is
// sets per body part.
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CEILING, FLOOR, GROUPS, MUSCLES, MuscleKey } from "./muscles";

// three.js only loads when the body view is opened.
const Body3D = dynamic(() => import("./body3d").then((m) => m.Body3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-[62vh] min-h-[380px] items-center justify-center">
      <p className="font-mono text-[11px] uppercase tracking-wider text-faint">loading the body…</p>
    </div>
  ),
});

type Counts = Partial<Record<MuscleKey, number>>;
interface Week {
  startedAt: string; // ISO date
  endedAt?: string; // stamped when the week is archived
  counts: Counts;
}
interface Store {
  version: 2;
  sex: "m" | "f";
  theme: "dark" | "light";
  week: Week | null; // null until the user starts one
  history: Week[]; // finished weeks, newest first
}

const LS_KEY = "tensets.v1";

/** Load the store, migrating v1 (auto-week map, single "delts") in place. */
function load(): Store {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version === 2) return parsed as Store;
      // v1 → v2: the newest auto-week becomes the active week; "delts"
      // counts land on side delts.
      const weeks: Record<string, Counts> = parsed.weeks ?? {};
      const keys = Object.keys(weeks).sort();
      const migrate = (c: Counts & { delts?: number }): Counts => {
        const { delts, ...rest } = c;
        return delts ? { ...rest, "side-delts": delts } : rest;
      };
      const latest = keys.at(-1);
      return {
        version: 2,
        sex: parsed.sex ?? "m",
        theme: "dark",
        week: latest ? { startedAt: new Date().toISOString(), counts: migrate(weeks[latest]) } : null,
        history: keys.slice(0, -1).map((k) => ({ startedAt: k, counts: migrate(weeks[k]) })),
      };
    }
  } catch {}
  return { version: 2, sex: "m", theme: "dark", week: null, history: [] };
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayOf(iso: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) + 1);
}

export default function Home() {
  const [store, setStore] = useState<Store | null>(null);
  const [view, setView] = useState<"log" | "body" | "history">("log");
  const [flash, setFlash] = useState<MuscleKey | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const rowRefs = useRef<Partial<Record<MuscleKey, HTMLDivElement | null>>>({});

  useEffect(() => setStore(load()), []);
  useEffect(() => {
    if (!store) return;
    localStorage.setItem(LS_KEY, JSON.stringify(store));
    document.documentElement.dataset.theme = store.theme;
  }, [store]);

  const counts: Counts = useMemo(() => store?.week?.counts ?? {}, [store]);
  const lastWeek: Counts = useMemo(() => store?.history[0]?.counts ?? {}, [store]);

  const bump = (key: MuscleKey, delta: number) => {
    setStore((s) => {
      if (!s?.week) return s;
      const next = Math.max(0, (s.week.counts[key] ?? 0) + delta);
      return { ...s, week: { ...s.week, counts: { ...s.week.counts, [key]: next } } };
    });
  };

  const startWeek = () => {
    setStore((s) => {
      if (!s) return s;
      const history = s.week ? [{ ...s.week, endedAt: new Date().toISOString() }, ...s.history] : s.history;
      return { ...s, week: { startedAt: new Date().toISOString(), counts: {} }, history };
    });
    setConfirmNew(false);
    setView("log");
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
      <main className="mx-auto max-w-xl px-4 py-10 sm:px-5">
        <div className="h-8 w-36 animate-pulse rounded bg-panel" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-panel" />
          ))}
        </div>
      </main>
    );
  }

  const progress: Partial<Record<MuscleKey, number>> = {};
  // Uncapped past 1 so the body keeps shifting hue beyond 10 sets (2 = ceiling).
  for (const m of MUSCLES) progress[m.key] = Math.min((counts[m.key] ?? 0) / FLOOR, 2);

  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-6 sm:px-5 sm:pt-8">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="wordmark text-2xl lowercase text-ink">
            ten<span style={{ color: "var(--accent)" }}>sets</span>
          </h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-sub">
            {store.week
              ? `week of ${fmtDay(store.week.startedAt)} · day ${dayOf(store.week.startedAt)}`
              : "no week running"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {store.history.length > 0 && (
            <button
              onClick={() => setView((v) => (v === "history" ? "log" : "history"))}
              title="Past weeks"
              aria-label="Week archive"
              className="flex size-9 items-center justify-center rounded-full border border-line font-mono text-[13px] text-sub transition-colors hover:text-ink"
              style={view === "history" ? { background: "var(--ink)", color: "var(--bg)" } : undefined}
            >
              ≡
            </button>
          )}
          <button
            onClick={() => setStore((s) => (s ? { ...s, theme: s.theme === "dark" ? "light" : "dark" } : s))}
            title={store.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle light / dark"
            className="flex size-9 items-center justify-center rounded-full border border-line text-sub transition-colors hover:text-ink"
          >
            {store.theme === "dark" ? "☾" : "☀"}
          </button>
          {store.week &&
            (confirmNew ? (
              <span className="flex items-center gap-1.5">
                <button
                  onClick={startWeek}
                  className="rounded-full px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-white"
                  style={{ background: "var(--accent)" }}
                >
                  archive &amp; start
                </button>
                <button
                  onClick={() => setConfirmNew(false)}
                  className="rounded-full border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-sub"
                >
                  keep going
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmNew(true)}
                title="Archive this week and start fresh"
                className="rounded-full border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-sub transition-colors hover:text-ink"
              >
                new week
              </button>
            ))}
        </div>
      </header>

      {view === "history" ? (
        /* The archive — every closed week, newest first. */
        <section className="mt-6 space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
            archive · {store.history.length} week{store.history.length === 1 ? "" : "s"}
          </p>
          {store.history.map((w, wi) => {
            const parts = MUSCLES.filter((m) => (w.counts[m.key] ?? 0) > 0);
            const hit = MUSCLES.filter((m) => (w.counts[m.key] ?? 0) >= FLOOR).length;
            return (
              <div key={wi} className="rounded-xl border border-line p-4" style={{ background: "var(--panel)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-ink">
                    {fmtDay(w.startedAt)}
                    {w.endedAt ? ` → ${fmtDay(w.endedAt)}` : ""}
                  </p>
                  <p className="font-mono text-[11px] text-sub">
                    <span className={hit > 0 ? "text-good" : ""}>{hit}</span> part{hit === 1 ? "" : "s"} at {FLOOR}
                  </p>
                </div>
                {parts.length === 0 ? (
                  <p className="mt-2 font-mono text-[11px] text-faint">nothing logged</p>
                ) : (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {parts.map((m) => {
                      const n = w.counts[m.key] ?? 0;
                      return (
                        <span
                          key={m.key}
                          className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px]"
                          style={{ color: n >= FLOOR ? "var(--good)" : "var(--sub)" }}
                        >
                          {m.name} {n}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ) : !store.week ? (
        /* No week yet — the app waits for you, it never resets itself. */
        <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
          <p className="wordmark text-lg text-ink">
            10<span style={{ color: "var(--accent)" }}>/wk</span>
          </p>
          <p className="mt-3 max-w-sm text-sm text-sub">
            Ten sets to failure per body part per week is where growth starts. Start a week, log every set with one
            tap, and close it out when you&apos;re done — it only rolls over when you say so.
          </p>
          <button
            onClick={startWeek}
            className="mt-6 rounded-full px-6 py-3 font-mono text-xs uppercase tracking-wider text-white transition-transform active:scale-95"
            style={{ background: "var(--accent)" }}
          >
            start my week
          </button>
        </div>
      ) : (
        <>
          {/* View toggle */}
          <div className="mt-6 flex items-center justify-between">
            <div className="flex overflow-hidden rounded-full border border-line">
              {(["log", "body"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="px-4 py-2 font-mono text-[11px] uppercase tracking-wider transition-colors"
                  style={{
                    background: view === v ? "var(--ink)" : "transparent",
                    color: view === v ? "var(--bg)" : "var(--sub)",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
            {view === "body" && (
              <button
                onClick={() => setStore((s) => (s ? { ...s, sex: s.sex === "m" ? "f" : "m" } : s))}
                title="Switch figure"
                className="rounded-full border border-line px-3.5 py-2 font-mono text-[11px] uppercase tracking-wider text-sub hover:text-ink"
              >
                {store.sex === "m" ? "♂" : "♀"}
              </button>
            )}
          </div>

          {view === "body" ? (
            <section className="mt-4">
              <Body3D sex={store.sex} light={store.theme === "light"} progress={progress} onPick={jumpTo} />
              <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-wider text-faint">
                drag to spin · red → green at 10 sets → violet at 20 · tap a muscle for its row
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
                          className={`relative flex items-center gap-3 px-3.5 py-3 sm:px-4 ${
                            i > 0 ? "border-t border-line" : ""
                          } ${flash === m.key ? "row-flash" : ""}`}
                          style={{ background: "var(--panel)" }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="truncate text-sm font-medium text-ink">{m.name}</p>
                              <p className="font-mono text-xs text-sub">
                                <span className={n >= FLOOR ? "text-good" : "text-ink"}>{n}</span>
                                <span className="text-faint">/{over ? CEILING : FLOOR}</span>
                                {last > 0 && <span className="ml-2 hidden text-faint sm:inline">last wk {last}</span>}
                              </p>
                            </div>
                            {/* the bar: 0→10; past 10 it re-scales to 0→20 with a marker at 10 */}
                            <div
                              className="relative mt-2 h-1.5 overflow-hidden rounded-full"
                              style={{ background: "var(--line)" }}
                            >
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
                              className="flex size-9 items-center justify-center rounded-full border border-line font-mono text-sub transition-colors hover:text-ink disabled:opacity-30"
                            >
                              −
                            </button>
                            <button
                              aria-label={`Log one set to failure on ${m.name}`}
                              title="+1 set to failure"
                              onClick={() => bump(m.key, 1)}
                              className="flex size-9 items-center justify-center rounded-full font-mono font-bold transition-transform active:scale-90"
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
        </>
      )}

      <footer className="mt-12 border-t border-line pt-5">
        <p className="text-xs leading-relaxed text-faint">
          The theory, whole: a muscle grows on ~10 sets to failure a week — fewer and it maintains, past ~20 the
          returns diminish. Weeks are yours to open and close. Your log lives in this browser; nothing leaves it.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-faint">
          The research behind the numbers:{" "}
          <a
            href="https://pubmed.ncbi.nlm.nih.gov/27433992/"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-sub"
          >
            Schoenfeld, Ogborn &amp; Krieger 2017
          </a>{" "}
          (10+ weekly sets per muscle drove the most growth) and{" "}
          <a
            href="https://pubmed.ncbi.nlm.nih.gov/35291645/"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-sub"
          >
            Baz-Valle et al. 2022
          </a>{" "}
          (12–20 sets as the upper productive range).
        </p>
      </footer>
    </main>
  );
}
