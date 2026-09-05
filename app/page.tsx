"use client";
// The landing page: the 3D body — lit like a finished week — is the hero,
// with the one-number pitch and a single call to action into the tracker.
// Returning users (anyone with a local log) skip straight past this to
// /track, so the marketing wall only ever greets a first-time visitor.
// Nothing here needs an account: the tracker is local-first and always has
// been; this page just says so out loud.
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MUSCLES, MuscleKey } from "./muscles";

const Body3D = dynamic(() => import("./body3d").then((m) => m.Body3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-[52vh] min-h-[340px] items-center justify-center">
      <p className="font-mono text-[11px] uppercase tracking-wider text-faint">
        warming the body…
      </p>
    </div>
  ),
});

const LS_KEY = "tensets.v1";

/** A pleasing spread of heat for the hero — a body mid-week, most parts
 * glowing toward the 10-set floor, a few pushing molten. Deterministic so
 * it looks composed rather than random. */
const HERO_PROGRESS: Partial<Record<MuscleKey, number>> = Object.fromEntries(
  MUSCLES.map((m, i) => [m.key, 0.55 + (((i * 7) % 11) / 11) * 1.05]),
) as Partial<Record<MuscleKey, number>>;

export default function Landing() {
  const router = useRouter();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    let saved: {
      theme?: "dark" | "light";
      week?: unknown;
      history?: unknown[];
    } | null = null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {}
    // Anyone who has already logged a set goes straight to their tracker.
    if (
      saved &&
      (saved.week || (Array.isArray(saved.history) && saved.history.length))
    ) {
      router.replace("/track");
      return;
    }
    const t = saved?.theme === "light" ? "light" : "dark";
    setTheme(t);
    document.documentElement.dataset.theme = t;
  }, [router]);

  const progress = useMemo(() => HERO_PROGRESS, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 pb-16 pt-7 sm:px-8 sm:pt-9">
      <header className="flex items-center justify-between">
        <h1 className="wordmark text-2xl lowercase text-ink">
          ten<span style={{ color: "var(--accent)" }}>sets</span>
        </h1>
        <div className="flex items-center gap-3">
          <Link
            href="/morning"
            className="text-xs text-sub transition-colors hover:text-ink"
          >
            AM routine <span aria-hidden="true">↗</span>
          </Link>
          <button
            onClick={() => {
              const next = theme === "dark" ? "light" : "dark";
              setTheme(next);
              document.documentElement.dataset.theme = next;
            }}
            aria-label="Toggle light / dark"
            className="flex size-9 items-center justify-center rounded-full border border-line text-sub transition-colors hover:text-ink"
          >
            {theme === "dark" ? "☾" : "☀"}
          </button>
        </div>
      </header>

      {/* Hero: the body is the pitch. Tap it, or the button, to begin. */}
      <section className="mt-7">
        <div>
          <Body3D
            sex="m"
            light={theme === "light"}
            progress={progress}
            onPick={() => router.push("/track")}
          />
        </div>
      </section>

      <section className="mt-8 text-center">
        <p className="page-kicker mb-3">A little structure. A stronger you.</p>
        <h2 className="text-[34px] font-medium leading-[1.12] tracking-[-0.055em] text-ink sm:text-5xl">
          10 <span className="text-sub">sets a week.</span>
          <br />
          <span style={{ color: "var(--accent)" }}>every body part.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-sub">
          A simple place for your workouts and your morning routine. Log each
          set, see your week take shape, and return to any day to fill in the
          details.
        </p>

        <button
          onClick={() => router.push("/track")}
          className="mt-7 rounded-xl px-8 py-3.5 text-sm font-semibold transition-transform active:scale-95"
          style={{ background: "var(--accent)", color: "var(--bg)" }}
        >
          Start training{" "}
          <span className="ml-3" aria-hidden="true">
            ↗
          </span>
        </button>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-faint">
          free · no account needed · sign in to sync devices
        </p>
      </section>

      {/* The three-beat what-it-does, kept terse. */}
      <section className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            k: "tap",
            t: "Tap a set",
            d: "One thumb per set to failure. No weights, no reps to enter — just the count that matters.",
          },
          {
            k: "watch",
            t: "Watch it light",
            d: "A real 3D body heats up muscle by muscle as the week fills in.",
          },
          {
            k: "own",
            t: "Weeks are yours",
            d: "Open and close a week when you decide. It never resets itself.",
          },
        ].map((c) => (
          <div
            key={c.k}
            className="rounded-xl border border-line p-4"
            style={{ background: "var(--panel)" }}
          >
            <p className="text-sm font-medium text-ink">{c.t}</p>
            <p className="mt-2 text-sm leading-relaxed text-sub">{c.d}</p>
          </div>
        ))}
      </section>

      <footer className="mt-12 border-t border-line pt-5">
        <p className="text-xs leading-relaxed text-faint">
          The theory, whole: a muscle grows on ~10 sets to failure a week —
          fewer and it maintains, past ~20 the returns diminish. Your log saves
          on your device and works without an account; an optional sign-in syncs
          it across devices.
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
          and{" "}
          <a
            href="https://pubmed.ncbi.nlm.nih.gov/35291645/"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-sub"
          >
            Baz-Valle et al. 2022
          </a>
          .
        </p>
      </footer>
    </main>
  );
}
