"use client";
// tensets/cloud — optional account sync on Supabase. The trackers stay
// local-first: localStorage is written first, always. When a session
// exists, each tracker keeps one row in tracker_state (kind = "sets" |
// "morning") holding its entire store as jsonb. On sign-in the newer
// side wins, judged by an updated_at stamp kept beside the local store;
// after that, every change is pushed (debounced) so the row always holds
// the full session data.
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;
export function supa(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key) : null;
  return client;
}

export type SyncState = "local" | "pulling" | "synced" | "error";
type Kind = "sets" | "morning";
const stampKey = (kind: Kind) => `tensets.sync.${kind}`;

/**
 * Wire a tracker store to its cloud row. `store` must be null until the
 * local load finishes; `adopt` replaces the local store when the cloud
 * copy is newer.
 */
export function useCloudSync<T>(kind: Kind, store: T | null, adopt: (data: T) => void) {
  const [session, setSession] = useState<Session | null>(null);
  const [sync, setSync] = useState<SyncState>("local");
  const reconciled = useRef(false);
  const loaded = useRef(false);
  const adopting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  const push = useCallback(
    async (sb: SupabaseClient, userId: string) => {
      const now = new Date().toISOString();
      const { error } = await sb
        .from("tracker_state")
        .upsert({ user_id: userId, kind, data: storeRef.current, updated_at: now });
      if (error) throw error;
      try {
        localStorage.setItem(stampKey(kind), now);
      } catch {}
    },
    [kind],
  );

  // Track the auth session.
  useEffect(() => {
    const sb = supa();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      if (!s) {
        reconciled.current = false;
        setSync("local");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Reconcile once per sign-in, after the local store has loaded: the
  // newer of (cloud row, local store) becomes the truth on both sides.
  useEffect(() => {
    const sb = supa();
    if (!sb || !session || store === null || reconciled.current) return;
    reconciled.current = true;
    setSync("pulling");
    (async () => {
      try {
        const { data: row, error } = await sb
          .from("tracker_state")
          .select("data, updated_at")
          .eq("kind", kind)
          .maybeSingle();
        if (error) throw error;
        let localStamp: string | null = null;
        try {
          localStamp = localStorage.getItem(stampKey(kind));
        } catch {}
        if (row && (!localStamp || row.updated_at > localStamp)) {
          adopting.current = true;
          try {
            localStorage.setItem(stampKey(kind), row.updated_at);
          } catch {}
          adopt(row.data as T);
        } else {
          await push(sb, session.user.id);
        }
        setSync("synced");
      } catch {
        setSync("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, store === null]);

  // Stamp every real local change (so offline edits win later merges),
  // and push it when signed in.
  useEffect(() => {
    if (store === null) return;
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    if (adopting.current) {
      adopting.current = false;
      return;
    }
    try {
      localStorage.setItem(stampKey(kind), new Date().toISOString());
    } catch {}
    if (!session || !reconciled.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const sb = supa();
      if (!sb || !session) return;
      try {
        await push(sb, session.user.id);
        setSync("synced");
      } catch {
        setSync("error");
      }
    }, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  return { session, sync };
}
