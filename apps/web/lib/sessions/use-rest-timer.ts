"use client";

import { playRestAlert } from "@/lib/audio/rest-alert";
import { isRestComplete, remainingRestSeconds, restEndsAt } from "@jim/core";
import { useCallback, useEffect, useState } from "react";

function storageKey(sessionId: string): string {
  return `jim:rest-timer:${sessionId}`;
}

function readStoredEndsAt(sessionId: string): Date | null {
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    return raw ? new Date(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Rest timer state, derived every tick from a stored absolute end timestamp
 * rather than accumulated (platform constraint 4, docs/ARCHITECTURE.md §2)
 * — backgrounding the app mid-rest and returning recomputes the correct
 * remaining time instead of drifting. Persisted to `localStorage` (not
 * Dexie/outbox: purely local, ephemeral UI state, not something that syncs)
 * so a full page reload mid-rest still shows the right countdown.
 */
export function useRestTimer(sessionId: string) {
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [alerted, setAlerted] = useState(false);

  useEffect(() => {
    setEndsAt(readStoredEndsAt(sessionId));
  }, [sessionId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 250);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") setNow(new Date());
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const start = useCallback(
    (durationSeconds: number) => {
      const end = restEndsAt(new Date(), durationSeconds);
      setEndsAt(end);
      setAlerted(false);
      try {
        window.localStorage.setItem(storageKey(sessionId), end.toISOString());
      } catch {
        // Safari private mode etc. — the timer still runs for this page life.
      }
    },
    [sessionId],
  );

  const skip = useCallback(() => {
    setEndsAt(null);
    try {
      window.localStorage.removeItem(storageKey(sessionId));
    } catch {
      // Nothing to clean up if it never wrote.
    }
  }, [sessionId]);

  const complete = endsAt !== null && isRestComplete(endsAt, now);
  const remaining = endsAt !== null ? remainingRestSeconds(endsAt, now) : 0;

  useEffect(() => {
    if (endsAt !== null && complete && !alerted) {
      playRestAlert();
      setAlerted(true);
    }
  }, [complete, endsAt, alerted]);

  return { active: endsAt !== null && !complete, remaining, start, skip };
}
