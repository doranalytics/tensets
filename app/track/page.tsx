"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { CEILING, FLOOR, GROUPS, MUSCLES, MuscleKey } from "../muscles";
import { useCloudSync } from "../cloud";
import { AppNav } from "../app-nav";
import { DayPicker } from "../day-picker";
import {
  countsForDay,
  loggedDates,
  replaceDay,
  setDayMuscle,
  totalSets,
  undatedSets,
  type Counts,
  type Week,
  type WorkoutStore,
} from "../workout-store";

const Body3D = dynamic(() => import("../body3d").then((m) => m.Body3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-[62vh] min-h-[380px] items-center justify-center rounded-3xl border border-line bg-panel">
      <p className="text-sm text-sub">Preparing your body map…</p>
    </div>
  ),
});

const LS_KEY = "tensets.v1";

/** Keep the existing v1 migration and v2 cloud/local storage shape intact. */
function load(): WorkoutStore {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version === 2) return parsed as WorkoutStore;
      const weeks: Record<string, Counts> = parsed.weeks ?? {};
      const keys = Object.keys(weeks).sort();
      const migrate = (counts: Counts & { delts?: number }): Counts => {
        const { delts, ...rest } = counts;
        return delts ? { ...rest, "side-delts": delts } : rest;
      };
      const latest = keys.at(-1);
      return {
        version: 2,
        sex: parsed.sex ?? "m",
        theme: "dark",
        week: latest
          ? {
              startedAt: new Date().toISOString(),
              counts: migrate(weeks[latest]),
            }
          : null,
        history: keys
          .slice(0, -1)
          .map((key) => ({ startedAt: key, counts: migrate(weeks[key]) })),
      };
    }
  } catch {}
  return { version: 2, sex: "m", theme: "dark", week: null, history: [] };
}

function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localDate(iso: string): string {
  return iso.length === 10 ? iso : dateKey(new Date(iso));
}

function fmtDay(iso: string): string {
  return new Date(`${localDate(iso)}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function fmtWeekRange(week: Week): string {
  const start = new Date(`${localDate(week.startedAt)}T12:00:00`);
  const end = week.endedAt
    ? new Date(`${localDate(week.endedAt)}T12:00:00`)
    : null;
  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      !end || start.getFullYear() !== end.getFullYear() ? "numeric" : undefined,
  });
  return end
    ? `${startLabel} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
    : startLabel;
}

function fmtChip(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
  });
}

function weekBounds(week: Week, today: string) {
  // Include recorded dates even if an older version logged outside its week.
  const dates = loggedDates(week);
  const min = [localDate(week.startedAt), ...dates].sort()[0];
  const max = [week.endedAt ? localDate(week.endedAt) : today, ...dates]
    .sort()
    .at(-1)!;
  return { min, max: max > today ? today : max };
}

export default function Home() {
  const [store, setStore] = useState<WorkoutStore | null>(null);
  const [view, setView] = useState<"log" | "body" | "history">("log");
  const [weekIndex, setWeekIndex] = useState(-1);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [today, setToday] = useState(dateKey);
  const selectedDate = selectedDay ?? today;
  const [flash, setFlash] = useState<MuscleKey | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [storageError, setStorageError] = useState(false);
  const rowRefs = useRef<Partial<Record<MuscleKey, HTMLDivElement | null>>>({});

  useEffect(() => setStore(load()), []);
  useEffect(() => {
    const refreshDate = () => setToday(dateKey());
    const timer = setInterval(refreshDate, 60_000);
    window.addEventListener("focus", refreshDate);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshDate);
    };
  }, []);
  const { session, sync } = useCloudSync<WorkoutStore>("sets", store, setStore);
  useEffect(() => {
    if (!store) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(store));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
    document.documentElement.dataset.theme = store.theme;
  }, [store]);

  const week = weekIndex < 0 ? store?.week : store?.history[weekIndex];
  const counts: Counts = useMemo(() => week?.counts ?? {}, [week]);
  const dayCounts = useMemo(
    () => (week ? countsForDay(week, selectedDate) : {}),
    [week, selectedDate],
  );
  const lastWeek =
    store?.history[weekIndex < 0 ? 0 : weekIndex + 1]?.counts ?? {};
  const bounds = week ? weekBounds(week, today) : undefined;
  const dayInWeek = Boolean(
    bounds && selectedDate >= bounds.min && selectedDate <= bounds.max,
  );

  const chooseWeek = (index: number) => {
    const chosen = index < 0 ? store?.week : store?.history[index];
    if (!chosen) return;
    const range = weekBounds(chosen, today);
    const date = index < 0 ? today : (loggedDates(chosen).at(-1) ?? range.max);
    setSelectedDay(
      index < 0 && date === today
        ? null
        : date < range.min
          ? range.min
          : date > range.max
            ? range.max
            : date,
    );
    setWeekIndex(index);
    setSaveMessage("");
    setView("log");
  };

  const updateSelectedWeek = (change: (current: Week) => Week) => {
    setStore((current) => {
      if (!current) return current;
      if (weekIndex < 0)
        return current.week
          ? { ...current, week: change(current.week) }
          : current;
      return {
        ...current,
        history: current.history.map((entry, index) =>
          index === weekIndex ? change(entry) : entry,
        ),
      };
    });
  };

  const bump = (key: MuscleKey, delta: number) => {
    if (!dayInWeek) return;
    updateSelectedWeek((current) =>
      setDayMuscle(
        current,
        selectedDate,
        key,
        (countsForDay(current, selectedDate)[key] ?? 0) + delta,
      ),
    );
    setSaveMessage(`Changes to ${fmtDay(selectedDate)} saved`);
  };

  const saveDay = () => {
    if (!dayInWeek) return;
    updateSelectedWeek((current) =>
      replaceDay(current, selectedDate, countsForDay(current, selectedDate)),
    );
    setSaveMessage(
      `${fmtDay(selectedDate)} saved${totalSets(dayCounts) === 0 ? " as a rest day" : ""}`,
    );
  };

  const startWeek = () => {
    const now = new Date();
    setStore((current) => {
      if (!current) return current;
      const history = current.week
        ? [{ ...current.week, endedAt: now.toISOString() }, ...current.history]
        : current.history;
      return {
        ...current,
        week: { startedAt: now.toISOString(), counts: {} },
        history,
      };
    });
    setConfirmNew(false);
    setWeekIndex(-1);
    setSelectedDay(null);
    setToday(dateKey(now));
    setSaveMessage("");
    setView("log");
  };

  const jumpTo = (key: MuscleKey) => {
    setView("log");
    setFlash(key);
    setTimeout(() => {
      rowRefs.current[key]?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
      setTimeout(() => setFlash(null), 1300);
    }, 60);
  };

  if (!store) {
    return (
      <main
        className="app-shell mx-auto max-w-2xl px-5 py-10 sm:px-8"
        aria-label="Loading workout log"
      >
        <div className="h-8 w-36 animate-pulse rounded bg-panel" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-panel" />
          ))}
        </div>
      </main>
    );
  }

  const progress: Partial<Record<MuscleKey, number>> = {};
  for (const muscle of MUSCLES)
    progress[muscle.key] = (counts[muscle.key] ?? 0) / FLOOR;
  const dates = week ? loggedDates(week) : [];
  const olderSets = week ? undatedSets(week) : 0;
  const musclesAtGoal = MUSCLES.filter(
    (muscle) => (counts[muscle.key] ?? 0) >= FLOOR,
  ).length;
  const savedDate = dates.includes(selectedDate);

  return (
    <main className="app-shell mx-auto max-w-2xl px-5 pb-20 pt-6 sm:px-8 sm:pt-9">
      <header className="flex items-center justify-between gap-3">
        <Link href="/" aria-label="tensets home" className="inline-block">
          <span className="wordmark text-xl lowercase text-ink sm:text-2xl">
            ten<span className="text-accent">sets</span>
          </span>
          <p className="mt-1.5 text-[11px] text-sub">Your daily practice.</p>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/account"
            aria-label="Account & sync"
            title={
              session
                ? sync === "error"
                  ? "Sync needs attention"
                  : "Account & sync"
                : "Sign in to sync across devices"
            }
            className="flex size-10 items-center justify-center rounded-full border border-line bg-panel text-sub hover:text-ink"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
            </svg>
          </Link>
          <button
            onClick={() =>
              setStore((current) =>
                current
                  ? {
                      ...current,
                      theme: current.theme === "dark" ? "light" : "dark",
                    }
                  : current,
              )
            }
            aria-label={
              store.theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
            className="flex size-10 items-center justify-center rounded-full border border-line bg-panel text-sub hover:text-ink"
          >
            {store.theme === "dark" ? "☾" : "☀"}
          </button>
        </div>
      </header>

      <AppNav active="sets" />

      <div className="mb-6 mt-8 flex items-end justify-between gap-4">
        <div>
          <p className="page-kicker">A little stronger, every week</p>
          <h1 className="page-title mt-2">Your training.</h1>
          <p className="mt-2 text-sm leading-relaxed text-sub">
            Ten sets. Each muscle. Your own pace.
          </p>
        </div>
        {store.week && (
          <button
            onClick={() => setConfirmNew((value) => !value)}
            className="shrink-0 rounded-full border border-line px-3.5 py-2.5 text-xs font-medium text-sub hover:text-ink"
          >
            New week <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>

      {confirmNew && (
        <section
          className="mb-5 rounded-2xl border border-line bg-panel p-4"
          aria-label="Start a new week"
        >
          <p className="text-sm font-medium text-ink">
            Ready for a fresh week?
          </p>
          <p className="mt-1 text-sm text-sub">
            This week moves to your archive. You can still edit every day.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={startWeek}
              className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white"
            >
              Archive &amp; start
            </button>
            <button
              onClick={() => setConfirmNew(false)}
              className="rounded-full border border-line px-4 py-2 text-xs text-sub"
            >
              Keep this week
            </button>
          </div>
        </section>
      )}

      <div className="segmented-control mb-6 flex" aria-label="Workout view">
        {(["log", "body", "history"] as const).map((option) => (
          <button
            key={option}
            onClick={() => setView(option)}
            aria-pressed={view === option}
            className="flex-1 px-3 py-2.5 text-sm font-medium"
          >
            {option === "log"
              ? "Daily log"
              : option === "body"
                ? "Body map"
                : "History"}
          </button>
        ))}
      </div>

      {storageError || sync === "error" ? (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-warn/30 bg-panel p-3 text-sm text-warn"
        >
          {storageError
            ? "This device couldn’t save your latest change. Keep this page open and free up browser storage."
            : "Your changes are saved on this device. Cloud sync needs attention in your account."}
        </p>
      ) : null}

      {view === "history" ? (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-ink">Past weeks</h2>
            <p className="text-xs text-sub">{store.history.length} archived</p>
          </div>
          {store.history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center">
              <p className="text-sm font-medium text-ink">
                Your history starts here.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-sub">
                When you start your next week, this one will appear here. Its
                days will always stay editable.
              </p>
              {store.week && (
                <button
                  onClick={() => chooseWeek(-1)}
                  className="mt-4 text-sm font-medium text-accent"
                >
                  Back to this week →
                </button>
              )}
            </div>
          ) : (
            store.history.map((entry, index) => {
              const parts = MUSCLES.filter(
                (muscle) => (entry.counts[muscle.key] ?? 0) > 0,
              );
              const hit = MUSCLES.filter(
                (muscle) => (entry.counts[muscle.key] ?? 0) >= FLOOR,
              ).length;
              return (
                <article
                  key={`${entry.startedAt}-${index}`}
                  className="rounded-2xl border border-line bg-panel p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-ink">
                        {fmtWeekRange(entry)}
                      </h3>
                      <p className="mt-1 text-xs text-sub">
                        {loggedDates(entry).length} logged days · {hit} muscles
                        at {FLOOR} sets
                      </p>
                    </div>
                    <button
                      onClick={() => chooseWeek(index)}
                      className="shrink-0 rounded-full border border-line px-3 py-2 text-xs font-medium text-ink"
                    >
                      Edit days <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                  {parts.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {parts.map((muscle) => (
                        <span
                          key={muscle.key}
                          className="rounded-full border border-line px-2.5 py-1 text-xs text-sub"
                        >
                          {muscle.name}{" "}
                          <span
                            className={
                              (entry.counts[muscle.key] ?? 0) >= FLOOR
                                ? "text-good"
                                : "text-ink"
                            }
                          >
                            {entry.counts[muscle.key]}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-sub">
                      No sets logged. You can still add a missed workout.
                    </p>
                  )}
                </article>
              );
            })
          )}
        </section>
      ) : !week ? (
        <section className="rounded-3xl border border-line bg-panel px-6 py-12 text-center">
          <span className="wordmark text-4xl text-accent">10</span>
          <h2 className="mt-5 text-xl font-semibold text-ink">
            Make this your first week.
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-sub">
            Log sets as you go, or come back and fill in a day. Your week rolls
            over when you decide.
          </p>
          <button
            onClick={startWeek}
            className="mt-6 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white"
          >
            Start my week →
          </button>
        </section>
      ) : (
        <>
          <section className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-sub">
                Training week
              </span>
              <select
                aria-label="Training week"
                value={weekIndex}
                onChange={(event) => chooseWeek(Number(event.target.value))}
                className="w-full max-w-[240px] cursor-pointer rounded-lg border border-line bg-panel py-2 pl-3 pr-7 text-sm font-medium text-ink"
              >
                {store.week && (
                  <option value={-1}>
                    Current · {fmtDay(store.week.startedAt)}
                  </option>
                )}
                {store.history.map((entry, index) => (
                  <option key={`${entry.startedAt}-${index}`} value={index}>
                    {fmtWeekRange(entry)} · archived
                  </option>
                ))}
              </select>
            </label>
            <p className="text-right text-xs text-sub">
              <span className="text-lg font-semibold tabular-nums text-ink">
                {musclesAtGoal}
                <span className="text-sm font-normal text-sub">
                  {" "}
                  / {MUSCLES.length}
                </span>
              </span>
              <span className="mt-0.5 block">muscles at 10 sets</span>
            </p>
          </section>

          {weekIndex >= 0 && (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
              <p className="text-xs leading-relaxed text-sub">
                Editing an archived week. Its totals update with your changes.
              </p>
              {store.week && (
                <button
                  onClick={() => chooseWeek(-1)}
                  className="shrink-0 text-xs font-medium text-accent"
                >
                  Current week →
                </button>
              )}
            </div>
          )}

          {view === "body" ? (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm text-sub">Your weekly work, mapped.</p>
                <button
                  onClick={() =>
                    setStore((current) =>
                      current
                        ? { ...current, sex: current.sex === "m" ? "f" : "m" }
                        : current,
                    )
                  }
                  className="rounded-full border border-line bg-panel px-3.5 py-2 text-xs text-sub"
                  aria-label="Switch body figure"
                >
                  {store.sex === "m" ? "Male figure" : "Female figure"}{" "}
                  <span aria-hidden="true">⇄</span>
                </button>
              </div>
              <Body3D
                sex={store.sex}
                light={store.theme === "light"}
                progress={progress}
                onPick={jumpTo}
              />
            </section>
          ) : (
            <>
              <DayPicker
                value={selectedDate}
                onChange={(date) => {
                  setSelectedDay(date === today && weekIndex < 0 ? null : date);
                  setSaveMessage("");
                }}
                today={today}
                min={bounds?.min}
                max={bounds?.max}
                caption="Workout day"
                summary={`${totalSets(dayCounts)} ${totalSets(dayCounts) === 1 ? "set" : "sets"} logged`}
              />

              <section className="day-log-panel mt-4 rounded-2xl border border-line bg-panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-medium text-ink">
                      {selectedDate === today
                        ? "Today’s workout"
                        : `Workout · ${fmtDay(selectedDate)}`}
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-sub">
                      {dayInWeek
                        ? "Add or remove sets for this day. Changes save automatically."
                        : "Choose a date within this training week to edit its sets."}
                    </p>
                  </div>
                  <button
                    onClick={saveDay}
                    disabled={!dayInWeek}
                    className="shrink-0 rounded-full border border-line px-3 py-2 text-xs font-medium text-ink disabled:opacity-40"
                  >
                    {savedDate
                      ? "Save day"
                      : totalSets(dayCounts) === 0
                        ? "Log rest day"
                        : "Save day"}
                  </button>
                </div>
                <p
                  role="status"
                  aria-live="polite"
                  className="mt-2 min-h-4 text-xs text-good"
                >
                  {storageError
                    ? ""
                    : saveMessage ||
                      (savedDate
                        ? totalSets(dayCounts) === 0
                          ? "Rest day logged"
                          : "Saved on this device"
                        : "")}
                </p>
                {dates.length > 0 && (
                  <div
                    className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3"
                    aria-label="Logged workout days"
                  >
                    {dates.map((date) => (
                      <button
                        key={date}
                        onClick={() => {
                          setSelectedDay(
                            date === today && weekIndex < 0 ? null : date,
                          );
                          setSaveMessage("");
                        }}
                        aria-pressed={date === selectedDate}
                        className={`rounded-full border px-2.5 py-1.5 text-xs transition-colors ${date === selectedDate ? "border-accent/40 bg-accent/10 text-accent" : "border-line text-sub hover:text-ink"}`}
                      >
                        {fmtChip(date)}{" "}
                        <span className="ml-1 tabular-nums">
                          {totalSets(countsForDay(week, date)) || "rest"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {olderSets > 0 && (
                <p className="mt-3 text-xs leading-relaxed text-sub">
                  {olderSets} earlier sets have no recorded day. They’re still
                  included in your weekly totals.
                </p>
              )}

              <div className="mb-3 mt-7 flex items-center justify-between">
                <p className="page-kicker">Sets by muscle</p>
                <p className="text-[11px] text-sub">
                  Week progress <span className="ml-4">Selected day</span>
                </p>
              </div>
              <section className="space-y-6" aria-label="Sets by muscle">
                {GROUPS.map((group) => (
                  <div key={group}>
                    <h2 className="mb-2 pl-1 text-xs font-semibold uppercase tracking-[0.12em] text-sub">
                      {group}
                    </h2>
                    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
                      {MUSCLES.filter((muscle) => muscle.group === group).map(
                        (muscle, index) => {
                          const weekly = counts[muscle.key] ?? 0;
                          const daily = dayCounts[muscle.key] ?? 0;
                          const over = weekly > FLOOR;
                          const scale = over ? CEILING : FLOOR;
                          const previous = lastWeek[muscle.key] ?? 0;
                          return (
                            <div
                              key={muscle.key}
                              ref={(element) => {
                                rowRefs.current[muscle.key] = element;
                              }}
                              className={`relative flex items-center gap-4 px-4 py-4 ${index > 0 ? "border-t border-line" : ""} ${flash === muscle.key ? "row-flash" : ""}`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                  <h3 className="truncate text-sm font-medium text-ink">
                                    {muscle.name}
                                  </h3>
                                  <span
                                    className={`shrink-0 text-[11px] tabular-nums ${weekly >= FLOOR ? "text-good" : "text-sub"}`}
                                  >
                                    <span className="font-semibold">
                                      {weekly}
                                    </span>
                                    <span className="text-sub">
                                      {" "}
                                      / {scale} wk
                                    </span>
                                  </span>
                                </div>
                                <div
                                  className="relative mt-2 h-1 overflow-hidden rounded-full bg-line"
                                  role="progressbar"
                                  aria-label={`${muscle.name} weekly sets`}
                                  aria-valuenow={weekly}
                                  aria-valuemin={0}
                                  aria-valuemax={Math.max(scale, weekly)}
                                >
                                  <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{
                                      width: `${Math.min(weekly / scale, 1) * 100}%`,
                                      background:
                                        weekly >= CEILING
                                          ? "var(--warn)"
                                          : weekly >= FLOOR
                                            ? "var(--good)"
                                            : "var(--accent)",
                                    }}
                                  />
                                  {over && (
                                    <div
                                      className="absolute top-0 h-full w-px bg-panel"
                                      style={{ left: "50%" }}
                                    />
                                  )}
                                </div>
                                {weekly >= CEILING ? (
                                  <p className="mt-1.5 text-[10px] text-warn">
                                    20+ sets · diminishing returns
                                  </p>
                                ) : previous > 0 ? (
                                  <p className="mt-1.5 text-[10px] text-sub">
                                    Last week {previous}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <button
                                  aria-label={`Remove a set from ${muscle.name} on ${selectedDate}`}
                                  onClick={() => bump(muscle.key, -1)}
                                  disabled={!dayInWeek || daily === 0}
                                  className="flex size-9 items-center justify-center rounded-full border border-line text-lg text-sub hover:text-ink disabled:opacity-25"
                                >
                                  −
                                </button>
                                <span
                                  className="w-6 text-center text-base font-semibold tabular-nums text-ink"
                                  aria-label={`${muscle.name} selected day sets`}
                                >
                                  {daily}
                                </span>
                                <button
                                  aria-label={`Add a set to ${muscle.name} on ${selectedDate}`}
                                  onClick={() => bump(muscle.key, 1)}
                                  disabled={!dayInWeek}
                                  className="flex size-9 items-center justify-center rounded-full bg-accent text-lg text-white transition-transform active:scale-90 disabled:opacity-25"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                ))}
              </section>
            </>
          )}
        </>
      )}

      <footer className="mt-10 border-t border-line pt-5">
        <p className="text-xs leading-relaxed text-sub">
          Aim for around 10 hard sets per muscle each week. Your weeks start and
          finish when you decide.{" "}
          {session ? (
            "Signed in for sync across devices."
          ) : (
            <>
              Saved on this device.{" "}
              <Link href="/account" className="text-accent hover:underline">
                Sign in to sync.
              </Link>
            </>
          )}
        </p>
        <details className="mt-3 text-xs text-sub">
          <summary className="cursor-pointer">
            The thinking behind ten sets
          </summary>
          <p className="mt-2 leading-relaxed">
            The weekly target is informed by research on training volume:{" "}
            <a
              href="https://pubmed.ncbi.nlm.nih.gov/27433992/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Schoenfeld, Ogborn &amp; Krieger 2017
            </a>{" "}
            and{" "}
            <a
              href="https://pubmed.ncbi.nlm.nih.gov/35291645/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Baz-Valle et al. 2022
            </a>
            .
          </p>
        </details>
      </footer>
    </main>
  );
}
