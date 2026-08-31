"use client";
// tensets/morning — the second tracker: a fixed morning routine, one
// checkbox per step per day. No customizing, no reordering; the routine
// is the routine. Days are local-midnight days; the streak counts
// mornings where every box got ticked.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCloudSync } from "../cloud";

const ITEMS = [
  { key: "up", label: "Get up immediately", sub: "don't linger in bed" },
  { key: "bed", label: "Make your bed" },
  { key: "cold", label: "Cold water on the face" },
  { key: "teeth", label: "Brush teeth" },
  { key: "water", label: "Drink water" },
  { key: "sun", label: "Get sunlight" },
  { key: "caffeine", label: "Get caffeine", sub: "phone unlocks after this" },
  { key: "meditate", label: "Meditate", sub: "10 minutes" },
  { key: "workout", label: "Workout" },
] as const;
type ItemKey = (typeof ITEMS)[number]["key"];

interface MorningStore {
  version: 1;
  days: Record<string, ItemKey[]>; // "YYYY-MM-DD" (local) → checked keys
}

const LS_KEY = "tensets.morning.v1";
const MAIN_KEY = "tensets.v1"; // theme lives with the sets tracker

function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function load(): MorningStore {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version === 1) return parsed as MorningStore;
    }
  } catch {}
  return { version: 1, days: {} };
}

function loadTheme(): "dark" | "light" {
  try {
    const raw = localStorage.getItem(MAIN_KEY);
    if (raw && JSON.parse(raw).theme === "light") return "light";
  } catch {}
  return "dark";
}

/** Persist the theme back into the sets store so both pages agree. */
function saveTheme(theme: "dark" | "light") {
  try {
    const raw = localStorage.getItem(MAIN_KEY);
    const parsed = raw ? JSON.parse(raw) : { version: 2, sex: "m", week: null, history: [] };
    localStorage.setItem(MAIN_KEY, JSON.stringify({ ...parsed, theme }));
  } catch {}
}

export default function Morning() {
  const [store, setStore] = useState<MorningStore | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [today, setToday] = useState(() => dayKey(new Date()));
  // Cloud sync: every morning ever ticked mirrors to the account when
  // signed in; the newer side wins on sign-in.
  const { session, sync } = useCloudSync<MorningStore>("morning", store, setStore);

  useEffect(() => {
    setStore(load());
    setTheme(loadTheme());
    // Roll the page over if it sits open past midnight.
    const t = setInterval(() => setToday(dayKey(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (store) localStorage.setItem(LS_KEY, JSON.stringify(store));
  }, [store]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  const checked = useMemo(() => new Set(store?.days[today] ?? []), [store, today]);
  const done = checked.size;
  const won = done === ITEMS.length;

  const toggle = (key: ItemKey) => {
    setStore((s) => {
      if (!s) return s;
      const cur = new Set(s.days[today] ?? []);
      if (cur.has(key)) cur.delete(key);
      else cur.add(key);
      return { ...s, days: { ...s.days, [today]: [...cur] } };
    });
  };

  // Streak of fully-ticked mornings. An incomplete today doesn't break a
  // run that's still alive from yesterday.
  const streak = useMemo(() => {
    if (!store) return 0;
    const complete = (k: string) => (store.days[k]?.length ?? 0) === ITEMS.length;
    let n = 0;
    const d = new Date();
    if (!complete(dayKey(d))) d.setDate(d.getDate() - 1);
    while (complete(dayKey(d))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }, [store, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // The last 14 mornings, oldest first, for the strip.
  const history = useMemo(() => {
    const out: { key: string; frac: number; label: string }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = dayKey(d);
      out.push({
        key: k,
        frac: (store?.days[k]?.length ?? 0) / ITEMS.length,
        label: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      });
    }
    return out;
  }, [store, today]);

  if (!store) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10 sm:px-5">
        <div className="h-8 w-36 animate-pulse rounded bg-panel" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-panel" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-6 sm:px-5 sm:pt-8">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="wordmark text-2xl lowercase text-ink">
            morn<span style={{ color: "var(--accent)" }}>ing</span>
          </h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-sub">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            {streak > 0 && (
              <>
                {" · "}
                <span className="text-good">
                  {streak}-day streak
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/account"
            title={session ? (sync === "error" ? "Sync hit an error — tap for details" : "Synced to your account") : "Sign in to sync across devices"}
            aria-label="Account & sync"
            className="flex size-9 items-center justify-center rounded-full border border-line font-mono text-[13px] transition-colors hover:text-ink"
            style={{ color: session ? (sync === "error" ? "var(--warn)" : "var(--good)") : "var(--sub)" }}
          >
            ☁
          </Link>
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle light / dark"
            className="flex size-9 items-center justify-center rounded-full border border-line text-sub transition-colors hover:text-ink"
          >
            {theme === "dark" ? "☾" : "☀"}
          </button>
          <Link
            href="/track"
            title="Back to the sets tracker"
            className="rounded-full border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-sub transition-colors hover:text-ink"
          >
            sets →
          </Link>
        </div>
      </header>

      {/* Today's progress */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">today</p>
          <p className="font-mono text-xs text-sub">
            <span className={won ? "text-good" : "text-ink"}>{done}</span>
            <span className="text-faint">/{ITEMS.length}</span>
          </p>
        </div>
        <div className="relative mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${(done / ITEMS.length) * 100}%`,
              background: won ? "var(--good)" : "linear-gradient(90deg, var(--accent-2), var(--accent))",
              boxShadow: won ? "0 0 8px rgba(52,211,153,.5)" : undefined,
            }}
          />
        </div>
      </div>

      {/* The routine — fixed order, tap a row to tick it */}
      <section className="mt-4 overflow-hidden rounded-xl border border-line">
        {ITEMS.map((item, i) => {
          const on = checked.has(item.key);
          return (
            <button
              key={item.key}
              onClick={() => toggle(item.key)}
              aria-pressed={on}
              aria-label={`${on ? "Untick" : "Tick"} ${item.label}`}
              className={`flex w-full items-center gap-3.5 px-3.5 py-3 text-left transition-colors sm:px-4 ${
                i > 0 ? "border-t border-line" : ""
              }`}
              style={{ background: "var(--panel)" }}
            >
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-[13px] font-bold transition-all"
                style={{
                  borderColor: on ? "var(--good)" : "var(--line)",
                  background: on ? "var(--good)" : "transparent",
                  color: on ? "var(--bg)" : "transparent",
                }}
              >
                ✓
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium transition-colors ${on ? "text-sub line-through" : "text-ink"}`}>
                  {item.label}
                </span>
                {"sub" in item && item.sub && (
                  <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider text-faint">
                    {item.sub}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-faint">{i + 1}</span>
            </button>
          );
        })}
      </section>

      {won && (
        <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-wider text-good">
          morning won — go take the day
        </p>
      )}

      {/* Last 14 mornings */}
      <section className="mt-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">last 14 mornings</p>
        <div className="mt-2.5 grid grid-cols-14 gap-1.5" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
          {history.map((d) => (
            <div
              key={d.key}
              title={`${d.label} — ${Math.round(d.frac * ITEMS.length)}/${ITEMS.length}`}
              className="aspect-square rounded-[5px] border border-line"
              style={{
                background:
                  d.frac === 0
                    ? "var(--panel)"
                    : `color-mix(in srgb, var(--good) ${Math.round(d.frac * 100)}%, var(--panel))`,
              }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-faint">
          <span>{history[0].label}</span>
          <span>today</span>
        </div>
      </section>

      <footer className="mt-12 border-t border-line pt-5">
        <p className="text-xs leading-relaxed text-faint">
          Nine boxes, same order, every morning. Tick them as you go — the streak only counts mornings where all nine
          fall. Your mornings save on this device — sign in and they follow you everywhere.
        </p>
      </footer>
    </main>
  );
}
