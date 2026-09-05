"use client";

import { type ReactNode, useId } from "react";

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function moveDay(value: string, by: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + by);
  return localDay(date);
}

export function DayPicker({
  value,
  onChange,
  today,
  min,
  max = today,
  caption,
  summary,
}: {
  value: string;
  onChange: (value: string) => void;
  today: string;
  min?: string;
  max?: string;
  caption?: ReactNode;
  summary?: ReactNode;
}) {
  const id = useId();
  const date = new Date(`${value}T12:00:00`);
  const select = (next: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next) || (min && next < min) || next > max)
      return;
    onChange(next);
  };
  const canToday = (!min || today >= min) && today <= max;

  return (
    <section className="day-picker" aria-label="Day to edit">
      <div className="day-picker-topline">
        <p className="page-kicker">{caption ?? "Your daily log"}</p>
        {value !== today && canToday && (
          <button
            type="button"
            className="today-button"
            onClick={() => select(today)}
          >
            Back to today <span aria-hidden="true">↗</span>
          </button>
        )}
        {value === today && <span className="today-badge">Today</span>}
      </div>
      <div className="day-picker-main">
        <button
          type="button"
          className="date-arrow"
          aria-label="Previous day"
          disabled={!!min && value <= min}
          onClick={() => select(moveDay(value, -1))}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>
        <div className="day-picker-date" aria-live="polite" aria-atomic="true">
          <p className="selected-day-title">
            {date.toLocaleDateString(undefined, { weekday: "long" })}
          </p>
          <p className="selected-day-subtitle">
            {date.toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <button
          type="button"
          className="date-arrow"
          aria-label="Next day"
          disabled={value >= max}
          onClick={() => select(moveDay(value, 1))}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="m10 6 6 6-6 6" />
          </svg>
        </button>
      </div>
      <div className="day-picker-bottom">
        <label className="calendar-field" htmlFor={id}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <rect x="4" y="5" width="16" height="16" rx="3" />
            <path d="M8 3v5m8-5v5M4 11h16" />
          </svg>
          <span className="sr-only">Choose date</span>
          <input
            id={id}
            type="date"
            value={value}
            min={min}
            max={max}
            onChange={(event) => select(event.target.value)}
          />
        </label>
        <div className="day-picker-summary">
          {summary ??
            (value === today ? "Make today count." : "Editing this day")}
        </div>
      </div>
    </section>
  );
}
