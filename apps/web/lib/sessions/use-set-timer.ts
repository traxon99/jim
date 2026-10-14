"use client";

import { workSecondsBetween } from "@jim/core";
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

export type SetTimerPhase = "idle" | "running" | "ended";

export interface SetTimer {
  phase: SetTimerPhase;
  /** Whole seconds so far (running) or the set's time (ended). */
  elapsed: number;
  start: () => void;
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

  const start = useCallback(() => {
    const at = new Date();
    setNow(at);
    save({ startedAt: at.toISOString(), endedAt: null });
  }, [save]);

  const end = useCallback(() => {
    if (!stored || stored.endedAt !== null) return;
    save({ ...stored, endedAt: new Date().toISOString() });
  }, [save, stored]);

  const clear = useCallback(() => save(null), [save]);

  const workSeconds = useCallback(() => {
    if (!stored) return null;
    const endedAt = stored.endedAt ? new Date(stored.endedAt) : new Date();
    return workSecondsBetween(new Date(stored.startedAt), endedAt);
  }, [stored]);

  let phase: SetTimerPhase = "idle";
  let elapsed = 0;
  if (stored) {
    phase = stored.endedAt === null ? "running" : "ended";
    const endedAt = stored.endedAt ? new Date(stored.endedAt) : now;
    elapsed = Math.max(
      0,
      Math.floor((endedAt.getTime() - new Date(stored.startedAt).getTime()) / 1000),
    );
  }

  return { phase, elapsed, start, end, clear, workSeconds };
}
