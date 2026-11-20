"use client";

import { setTimerReadout, workSecondsBetween } from "@jim/core";
import { useCallback, useEffect, useState } from "react";

function storageKey(sessionId: string): string {
  return `jim:set-timer:${sessionId}`;
}

interface Stored {
  startedAt: string;
  endedAt: string | null;
}

function readStored(key: string): Stored | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (typeof parsed.startedAt !== "string") return null;
    return {
      startedAt: parsed.startedAt,
      endedAt: typeof parsed.endedAt === "string" ? parsed.endedAt : null,
    };
  } catch {
    return null;
  }
}

function writeStored(key: string, value: Stored | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Safari private mode etc. — state still holds for this page life.
  }
}

export type SetTimerPhase = "idle" | "ready" | "running" | "ended";

export interface SetTimer {
  phase: SetTimerPhase;
  /** Whole seconds so far (running) or the set's time (ended). */
  elapsed: number;
  /** Seconds left to get into position before the set starts (issue #846); 0 otherwise. */
  readyRemaining: number;
  /** When the set itself starts (after any get-ready countdown), ms since epoch; null when idle. */
  startedAtMs: number | null;
  /** Starts a set; `readySeconds` first counts down to get into position (tempo cues, issue #846). */
  start: (readySeconds?: number) => void;
  /** Ends the get-ready countdown now, so the set starts on this tap. */
  skipReady: () => void;
  end: () => void;
  clear: () => void;
  /**
   * The time to log with the set being saved right now: up to now while
   * running, the ended time after End set, null when idle or left running too
   * long. Doesn't clear; the caller clears once the set is saved.
   */
  workSeconds: () => number | null;
}

/**
 * Working set timer (issue #634): Start set to End set, timing the set
 * itself. Like the rest timer it keeps absolute timestamps rather than a
 * count, so backgrounding the app mid-set still reads right, and keeps them
 * in `localStorage` (ephemeral UI state, not synced) so a reload mid-set
 * doesn't lose the start. The time lands on the next set logged.
 */
export function useSetTimer(sessionId: string): SetTimer {
  const [stored, setStored] = useState<Stored | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    setStored(readStored(storageKey(sessionId)));
  }, [sessionId]);

  // Ticking covers the get-ready countdown too: both have no end yet.
  const running = stored !== null && stored.endedAt === null;
  useEffect(() => {
    if (!running) return;
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 250);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") setNow(new Date());
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [running]);

  const save = useCallback(
    (value: Stored | null) => {
      setStored(value);
      writeStored(storageKey(sessionId), value);
    },
    [sessionId],
  );

  const start = useCallback(
    (readySeconds = 0) => {
      const at = new Date();
      setNow(at);
      const startedAt = new Date(at.getTime() + Math.max(0, readySeconds) * 1000);
      save({ startedAt: startedAt.toISOString(), endedAt: null });
    },
    [save],
  );

  const skipReady = useCallback(() => {
    if (!stored || stored.endedAt !== null) return;
    const at = new Date();
    if (new Date(stored.startedAt) <= at) return;
    setNow(at);
    save({ startedAt: at.toISOString(), endedAt: null });
  }, [save, stored]);

  const end = useCallback(() => {
    if (!stored || stored.endedAt !== null) return;
    const at = new Date();
    // Ending during the countdown means no set ran: back to idle.
    if (new Date(stored.startedAt) > at) save(null);
    else save({ ...stored, endedAt: at.toISOString() });
  }, [save, stored]);

  const clear = useCallback(() => save(null), [save]);

  const workSeconds = useCallback(() => {
    if (!stored) return null;
    const endedAt = stored.endedAt ? new Date(stored.endedAt) : new Date();
    // A set logged during the get-ready countdown has no time of its own.
    if (new Date(stored.startedAt) > endedAt) return null;
    return workSecondsBetween(new Date(stored.startedAt), endedAt);
  }, [stored]);

  const startedAtMs = stored ? new Date(stored.startedAt).getTime() : null;
  const readout =
    stored && startedAtMs !== null
      ? setTimerReadout(
          startedAtMs,
          stored.endedAt ? new Date(stored.endedAt).getTime() : null,
          now.getTime(),
        )
      : null;

  return {
    phase: readout?.phase ?? "idle",
    elapsed: readout?.elapsed ?? 0,
    readyRemaining: readout?.readyRemaining ?? 0,
    startedAtMs,
    start,
    skipReady,
    end,
    clear,
    workSeconds,
  };
}
