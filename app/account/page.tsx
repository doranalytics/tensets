"use client";
// tensets/account — email + password, nothing else. Signing in makes both
// trackers (sets and mornings) follow you across devices; signed out, the
// app keeps working exactly as before, saved on the device.
import { useEffect, useState } from "react";
import Link from "next/link";
import { supa } from "../cloud";
import type { Session } from "@supabase/supabase-js";

export default function Account() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"in" | "up" | "out" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The account page keeps the theme the trackers chose.
    try {
      const raw = localStorage.getItem("tensets.v1");
      document.documentElement.dataset.theme = raw && JSON.parse(raw).theme === "light" ? "light" : "dark";
    } catch {}
    const sb = supa();
    if (!sb) {
      setChecked(true);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (mode: "in" | "up") => {
    const sb = supa();
    if (!sb) return;
    if (!email.trim() || !password) {
      setError("Email and password, both.");
      return;
    }
    setBusy(mode);
    setError(null);
    try {
      const { error } =
        mode === "in"
          ? await sb.auth.signInWithPassword({ email: email.trim(), password })
          : await sb.auth.signUp({ email: email.trim(), password });
      if (error) throw error;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again.");
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    const sb = supa();
    if (!sb) return;
    setBusy("out");
    await sb.auth.signOut();
    setBusy(null);
  };

  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-6 sm:px-5 sm:pt-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="wordmark text-2xl lowercase text-ink">
            acc<span style={{ color: "var(--accent)" }}>ount</span>
          </h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-sub">
            {session ? "synced across your devices" : "one login, both trackers"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/track"
            className="rounded-full border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-sub transition-colors hover:text-ink"
          >
            sets →
          </Link>
          <Link
            href="/morning"
            className="rounded-full border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-sub transition-colors hover:text-ink"
          >
            ☀ am
          </Link>
        </div>
      </header>

      {!checked ? (
        <div className="mt-8 space-y-3">
          <div className="h-12 animate-pulse rounded-xl bg-panel" />
          <div className="h-12 animate-pulse rounded-xl bg-panel" />
        </div>
      ) : !supa() ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
          <p className="text-sm text-sub">
            Sync isn&apos;t configured on this build. Your log still saves on this device.
          </p>
        </div>
      ) : session ? (
        /* Signed in */
        <section className="mt-8 space-y-4">
          <div className="rounded-xl border border-line p-5" style={{ background: "var(--panel)" }}>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">signed in as</p>
            <p className="mt-1.5 truncate text-sm font-medium text-ink">{session.user.email}</p>
            <p className="mt-3 text-xs leading-relaxed text-sub">
              Your sets weeks (current + archive) and your mornings all live in your account now. Log on any
              device you sign in on and the others follow — the most recent change wins.
            </p>
          </div>
          <button
            onClick={signOut}
            disabled={busy === "out"}
            className="rounded-full border border-line px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider text-sub transition-colors hover:text-ink disabled:opacity-40"
          >
            {busy === "out" ? "signing out…" : "sign out"}
          </button>
          <p className="text-xs leading-relaxed text-faint">
            Signing out leaves your log on this device untouched — it just stops following you.
          </p>
        </section>
      ) : (
        /* Signed out */
        <section className="mt-8">
          <div className="rounded-xl border border-line p-5" style={{ background: "var(--panel)" }}>
            <label className="block font-mono text-[11px] uppercase tracking-[0.2em] text-faint" htmlFor="email">
              email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 w-full rounded-lg border border-line bg-transparent px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-[var(--accent)]"
            />
            <label
              className="mt-4 block font-mono text-[11px] uppercase tracking-[0.2em] text-faint"
              htmlFor="password"
            >
              password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit("in")}
              placeholder="••••••••"
              className="mt-1.5 w-full rounded-lg border border-line bg-transparent px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-[var(--accent)]"
            />
            {error && <p className="mt-3 text-xs text-warn">{error}</p>}
            <div className="mt-5 flex items-center gap-2">
              <button
                onClick={() => submit("in")}
                disabled={busy !== null}
                className="rounded-full px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider text-white transition-transform active:scale-95 disabled:opacity-40"
                style={{ background: "var(--accent)" }}
              >
                {busy === "in" ? "signing in…" : "sign in"}
              </button>
              <button
                onClick={() => submit("up")}
                disabled={busy !== null}
                className="rounded-full border border-line px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider text-sub transition-colors hover:text-ink disabled:opacity-40"
              >
                {busy === "up" ? "creating…" : "create account"}
              </button>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-faint">
            An account is optional. It exists for one reason: your sets and mornings sync to it, so a new phone
            or a second browser picks up right where you left off. No email verification, no newsletter.
          </p>
        </section>
      )}
    </main>
  );
}
