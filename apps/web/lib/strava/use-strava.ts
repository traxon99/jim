"use client";

import type { StravaPostInfo } from "@jim/core";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  type StravaConnectionInfo,
  fetchStravaActivities,
  fetchStravaConnection,
} from "./client-api";

export type StravaConnectionLoad =
  | { status: "loading" }
  | { status: "error"; error: string }
  | ({ status: "ready" } & StravaConnectionInfo);

const LOADING: StravaConnectionLoad = { status: "loading" };

// One copy for every screen (#524): Settings, the finish screen and History
// all read it, so a change on one updates the others.
let shared: StravaConnectionLoad = LOADING;
const listeners = new Set<() => void>();

function setShared(next: StravaConnectionLoad) {
  shared = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) shared = LOADING;
  };
}

export async function refreshStravaConnection(): Promise<void> {
  const result = await fetchStravaConnection();
  if (result.ok) setShared({ status: "ready", ...result.value });
  else if (shared.status !== "ready") setShared({ status: "error", error: result.error });
}

/** Optimistic local update after a switch, so the row doesn't wait on a refetch. */
export function patchStravaConnection(patch: Partial<StravaConnectionInfo>): void {
  if (shared.status === "ready") setShared({ ...shared, ...patch });
}

/** Whether the account is linked to Strava, and how; refreshed when the app returns to the foreground. */
export function useStravaConnection(): {
  load: StravaConnectionLoad;
  refresh: () => Promise<void>;
} {
  const load = useSyncExternalStore(
    subscribe,
    () => shared,
    () => LOADING,
  );
  const refresh = useCallback(() => refreshStravaConnection(), []);

  useEffect(() => {
    void refreshStravaConnection();
    function onVisible() {
      if (document.visibilityState === "visible") void refreshStravaConnection();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return { load, refresh };
}

/** While a post is queued or in flight, look again this often. */
const POLL_MS = 5_000;
const MAX_POLLS = 24;

/**
 * Strava post status for these workouts (issue #836), fetched while connected
 * and re-checked every few seconds until nothing is still queued or posting.
 * Null while unknown (loading, offline or not connected).
 */
export function useStravaActivities(
  sessionIds: readonly string[],
  enabled: boolean,
): { activities: Record<string, StravaPostInfo> | null; refresh: () => Promise<void> } {
  const [activities, setActivities] = useState<Record<string, StravaPostInfo> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const polls = useRef(0);
  const alive = useRef(true);
  const key = sessionIds.join(",");

  const load = useCallback(async () => {
    if (!enabled || key === "") return;
    const result = await fetchStravaActivities(key.split(","));
    if (!alive.current || !result.ok) return;
    setActivities(result.value);
    const pending = Object.values(result.value).some(
      (info) => info.status === "queued" || info.status === "posting",
    );
    if (timer.current) clearTimeout(timer.current);
    if (pending && polls.current < MAX_POLLS) {
      polls.current += 1;
      timer.current = setTimeout(() => void load(), POLL_MS);
    }
  }, [enabled, key]);

  useEffect(() => {
    alive.current = true;
    polls.current = 0;
    void load();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const refresh = useCallback(async () => {
    polls.current = 0;
    await load();
  }, [load]);

  return { activities, refresh };
}
