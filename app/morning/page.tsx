"use client";
// tensets/morning — the second tracker: a fixed morning routine, one
// checkbox per step per day. No customizing, no reordering; the routine
// is the routine. Days are local-midnight days; the streak counts
// mornings where every box got ticked.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCloudSync } from "../cloud";
import { AppNav } from "../app-nav";
import { DayPicker } from "../day-picker";

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

function fmtDay(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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
    const parsed = raw
      ? JSON.parse(raw)
      : { version: 2, sex: "m", week: null, history: [] };
    localStorage.setItem(MAIN_KEY, JSON.stringify({ ...parsed, theme }));
  } catch {}
}

export default function Morning() {
  const [store, setStore] = useState<MorningStore | null>(null);
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  const [today, setToday] = useState(() => dayKey(new Date()));
  // null follows the current day, including a page left open past midnight.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const selectedDay = selectedDate ?? today;
  const isToday = selectedDay === today;
  // Cloud sync: every morning ever ticked mirrors to the account when
  // signed in; the newer side wins on sign-in.
  const { session, sync } = useCloudSync<MorningStore>(
    "morning",
    store,
    setStore,
  );

  useEffect(() => {
    setStore(load());
    setTheme(loadTheme());
    // Roll the page over if it sits open past midnight.
    const t = setInterval(() => setToday(dayKey(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!store) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(store));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [store]);
  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  const selectDay = (key: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key > today) return;
    const date = new Date(`${key}T12:00:00`);
    if (Number.isNaN(date.getTime()) || dayKey(date) !== key) return;
    setSelectedDate(key === today ? null : key);
  };

  const checked = useMemo(
    () => new Set(store?.days[selectedDay] ?? []),
    [store, selectedDay],
  );
  const done = checked.size;
  const won = done === ITEMS.length;

  const toggle = (key: ItemKey) => {
    setStore((s) => {
      if (!s) return s;
      if (selectedDay > today) return s;
      const cur = new Set(s.days[selectedDay] ?? []);
      if (cur.has(key)) cur.delete(key);
      else cur.add(key);
      return { ...s, days: { ...s.days, [selectedDay]: [...cur] } };
    });
  };

  // Streak of fully-ticked mornings. An incomplete today doesn't break a
  // run that's still alive from yesterday.
  const streak = useMemo(() => {
    if (!store) return 0;
    const complete = (k: string) =>
      (store.days[k]?.length ?? 0) === ITEMS.length;
    let n = 0;
    const d = new Date(`${today}T12:00:00`);
    if (!complete(dayKey(d))) d.setDate(d.getDate() - 1);
    while (complete(dayKey(d))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }, [store, today]);

  // The last 14 mornings, oldest first, for the strip.
  const history = useMemo(() => {
    const out: {
      key: string;
      count: number;
      label: string;
      weekday: string;
      day: number;
    }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(`${today}T12:00:00`);
      d.setDate(d.getDate() - i);
      const k = dayKey(d);
      out.push({
        key: k,
        count: store?.days[k]?.length ?? 0,
        label: fmtDay(k),
        weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
        day: d.getDate(),
      });
    }
    return out;
  }, [store, today]);

  if (!store) {
    return (
      <main
        className="mx-auto max-w-2xl px-5 py-10 sm:px-8"
        aria-label="Loading morning routine"
        aria-busy="true"
      >
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
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-6 sm:px-8 sm:pt-9">
      <header className="flex items-center justify-between gap-3">
        <div>
          <Link
            href="/track"
            aria-label="Ten Sets home"
            className="wordmark text-xl text-ink sm:text-2xl"
          >
            ten<span className="text-accent">sets</span>
          </Link>
          <p className="mt-1 text-xs text-sub">Your daily practice.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/account"
            title={
              session
                ? sync === "error"
                  ? "Sync hit an error — tap for details"
                  : "Synced to your account"
                : "Sign in to sync across devices"
            }
            aria-label="Account & sync"
            className="flex size-10 items-center justify-center rounded-full border border-line bg-panel transition-colors hover:border-sub"
            style={{
              color: session
                ? sync === "error"
                  ? "var(--warn)"
                  : "var(--good)"
                : "var(--sub)",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 18a5 5 0 0 1-1-9.9A6 6 0 0 1 17.7 7a5.5 5.5 0 0 1 .8 11H7Z" />
            </svg>
          </Link>
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            aria-label="Toggle light / dark"
            className="flex size-10 items-center justify-center rounded-full border border-line bg-panel text-sub transition-colors hover:border-sub hover:text-ink"
          >
            {theme === "dark" ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <AppNav active="morning" />

      <div className="mb-6 mt-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-3xl">
            Morning routine
          </h1>
          <p className="mt-2 text-sm text-sub">
            Nine small steps. A steadier start.
          </p>
        </div>
        {streak > 0 && (
          <div
            className="shrink-0 rounded-2xl border border-line bg-panel px-3.5 py-2.5 text-center"
            title="Consecutive complete mornings, through today or yesterday"
          >
            <p className="text-xl font-semibold tabular-nums text-good">
              {streak}
            </p>
            <p className="mt-0.5 text-[10px] text-sub">day streak</p>
          </div>
        )}
      </div>

      <DayPicker
        value={selectedDay}
        onChange={selectDay}
        today={today}
        max={today}
        caption={isToday ? "Your morning" : "Editing a past morning"}
        summary={`${done} of ${ITEMS.length} complete`}
      />

      <section
        className="mt-5 overflow-hidden rounded-3xl border border-line bg-panel"
        aria-label={`Morning checklist for ${fmtDay(selectedDay)}`}
      >
        <div className="border-b border-line px-5 pb-5 pt-5 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium">
                {won ? "Morning complete" : "One step at a time"}
              </h2>
              <p className="mt-1 text-xs text-sub">
                {won
                  ? "All nine, done. Carry that into your day."
                  : "Tap each step as you go."}
              </p>
            </div>
            <p className="shrink-0 text-2xl font-semibold tabular-nums tracking-tight">
              <span className={won ? "text-good" : "text-ink"}>{done}</span>
              <span className="ml-1 text-base font-normal text-faint">
                / {ITEMS.length}
              </span>
            </p>
          </div>
          <div
            className="mt-4 flex gap-1.5"
            role="progressbar"
            aria-label="Morning completion"
            aria-valuemin={0}
            aria-valuemax={ITEMS.length}
            aria-valuenow={done}
          >
            {ITEMS.map((item, i) => (
              <span
                key={item.key}
                className="h-1.5 flex-1 rounded-full transition-colors"
                style={{
                  background:
                    i < done
                      ? won
                        ? "var(--good)"
                        : "var(--accent)"
                      : "var(--line)",
                }}
              />
            ))}
          </div>
        </div>

        {ITEMS.map((item, i) => {
          const on = checked.has(item.key);
          return (
            <button
              key={item.key}
              onClick={() => toggle(item.key)}
              aria-pressed={on}
              aria-label={`${on ? "Untick" : "Tick"} ${item.label}`}
              className={`group flex min-h-16 w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-bg/40 sm:px-6 ${i > 0 ? "border-t border-line" : ""}`}
            >
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-lg border transition-all"
                style={{
                  borderColor: on ? "var(--good)" : "var(--sub)",
                  background: on ? "var(--good)" : "transparent",
                  color: on ? "var(--bg)" : "transparent",
                }}
                aria-hidden="true"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m4 10 4 4 8-8" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-medium transition-colors ${on ? "text-sub" : "text-ink"}`}
                >
                  {item.label}
                </span>
                {"sub" in item && item.sub && (
                  <span className="mt-1 block text-xs text-sub">
                    {item.sub}
                  </span>
                )}
              </span>
              <span
                className="shrink-0 text-[11px] tabular-nums text-faint"
                aria-hidden="true"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
            </button>
          );
        })}
      </section>

      <p
        className={`mt-3 text-center text-xs ${saveError ? "text-warn" : "text-sub"}`}
        role="status"
        aria-live="polite"
      >
        {saveError
          ? "This device couldn’t save your changes. Keep this page open and free up browser storage."
          : Object.hasOwn(store.days, selectedDay)
            ? `Saved to ${fmtDay(selectedDay)} · Changes save automatically`
            : `Changes save to ${fmtDay(selectedDay)} automatically`}
      </p>

      <section className="mt-9" aria-labelledby="morning-history-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="morning-history-heading"
            className="text-base font-semibold tracking-tight"
          >
            Recent mornings
          </h2>
          <p className="text-xs text-sub">Tap a day to edit</p>
        </div>
        <p className="mt-1 text-xs text-sub">
          {history[0].label} – {history[history.length - 1].label}
        </p>
        <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
          {history.map((d) => {
            const selected = d.key === selectedDay;
            const complete = d.count === ITEMS.length;
            return (
              <button
                key={d.key}
                onClick={() => selectDay(d.key)}
                title={`${d.label} — ${d.count} of ${ITEMS.length} complete. Edit morning.`}
                aria-label={`Edit morning for ${d.label}, ${d.count} of ${ITEMS.length} complete`}
                aria-pressed={selected}
                className="flex min-w-0 flex-col items-center rounded-xl border px-1 py-3 transition-colors hover:border-sub sm:rounded-2xl"
                style={{
                  borderColor: selected ? "var(--accent)" : "var(--line)",
                  background: selected
                    ? "color-mix(in srgb, var(--accent) 11%, var(--panel))"
                    : "var(--panel)",
                }}
              >
                <span
                  className={`text-[10px] ${selected ? "text-accent" : "text-sub"}`}
                >
                  {d.key === today ? "Today" : d.weekday}
                </span>
                <span
                  className={`mt-1 text-lg font-medium tabular-nums ${selected ? "text-accent" : "text-ink"}`}
                >
                  {d.day}
                </span>
                <span
                  className={`mt-1.5 text-[10px] tabular-nums ${complete ? "text-good" : "text-sub"}`}
                >
                  {complete ? "✓ 9/9" : `${d.count}/9`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <footer className="mt-10 border-t border-line pt-5">
        <p className="text-xs leading-relaxed text-sub">
          The same nine steps, every morning. Complete all nine to build your
          streak.
          {session
            ? " Your mornings sync to your account."
            : " Your mornings save on this device."}
          {!session && (
            <>
              {" "}
              <Link
                href="/account"
                className="text-ink underline decoration-line underline-offset-4 hover:decoration-sub"
              >
                Sign in to sync across devices.
              </Link>
            </>
          )}
        </p>
      </footer>
    </main>
  );
}
