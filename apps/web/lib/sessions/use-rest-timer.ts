"use client";

import { playRestAlert } from "@/lib/audio/rest-alert";
import { restCompleteMessage } from "@/lib/pwa/notifications";
import {
  cancelRestCompletePush,
  scheduleRestCompletePush,
  showLocalNotification,
} from "@/lib/pwa/push-client";
import { isRestComplete, remainingRestSeconds, restEndsAt } from "@jim/core";
import { useCallback, useEffect, useRef, useState } from "react";

function storageKey(sessionId: string): string {
  return `jim:rest-timer:${sessionId}`;
}

/** The `endsAt` (ISO) the server has a push scheduled for, if any. */
function pushStorageKey(sessionId: string): string {
  return `jim:rest-timer-push:${sessionId}`;
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Safari private mode etc. — state still holds for this page life.
  }
}

/**
 * Rest timer state, derived every tick from a stored absolute end timestamp
 * rather than accumulated (platform constraint 4, docs/ARCHITECTURE.md §2)
 * — backgrounding the app mid-rest and returning recomputes the correct
 * remaining time instead of drifting. Persisted to `localStorage` (not
 * Dexie/outbox: purely local, ephemeral UI state, not something that syncs)
 * so a full page reload mid-rest still shows the right countdown.
 *
 * The completion notification can't come from this hook alone: iOS suspends
 * a backgrounded PWA's JS, so the tick that notices the rest is over only
 * runs once the user reopens Jim. So `start` also asks the server to push it
 * at `endsAt` (docs/DECISIONS.md ADR-014), and the page-side notification is
 * only the fallback for when that couldn't be scheduled.
 */
export function useRestTimer(sessionId: string) {
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [alerted, setAlerted] = useState(false);
  const [pushedFor, setPushedFor] = useState<string | null>(null);
  const pushedForRef = useRef<string | null>(null);
  // Schedule/cancel requests run one at a time, in order, so a quick skip
  // can't reach the server before the schedule it's meant to cancel.
  const pushQueue = useRef<Promise<void>>(Promise.resolve());

  const markPushed = useCallback(
    (iso: string | null) => {
      pushedForRef.current = iso;
      setPushedFor(iso);
      writeStored(pushStorageKey(sessionId), iso);
    },
    [sessionId],
  );

  const enqueuePush = useCallback((task: () => Promise<void>) => {
    pushQueue.current = pushQueue.current.then(task).catch(() => {});
  }, []);

  useEffect(() => {
    const stored = readStored(storageKey(sessionId));
    setEndsAt(stored ? new Date(stored) : null);
    const pushed = readStored(pushStorageKey(sessionId));
    pushedForRef.current = pushed;
    setPushedFor(pushed);
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

  // Runs the rest to `end`, and moves the server push there with it.
  const runUntil = useCallback(
    (end: Date) => {
      setEndsAt(end);
      setAlerted(false);
      writeStored(storageKey(sessionId), end.toISOString());
      enqueuePush(async () => {
        if (await scheduleRestCompletePush(end).catch(() => false)) {
          // Server-side this replaced any earlier pending rest.
          markPushed(end.toISOString());
        } else if (pushedForRef.current) {
          // An earlier rest's push is still scheduled and would fire at the
          // wrong time; this rest falls back to the local notification.
          markPushed(null);
          await cancelRestCompletePush();
        }
      });
    },
    [sessionId, enqueuePush, markPushed],
  );

  const start = useCallback(
    (durationSeconds: number) => runUntil(restEndsAt(new Date(), durationSeconds)),
    [runUntil],
  );

  const skip = useCallback(() => {
    setEndsAt(null);
    writeStored(storageKey(sessionId), null);
    enqueuePush(async () => {
      if (!pushedForRef.current) return;
      markPushed(null);
      await cancelRestCompletePush();
    });
  }, [sessionId, enqueuePush, markPushed]);

  /**
   * −15s / +15s (issue #324): moves the end time, and the scheduled push with
   * it. Taking off more than is left just ends the rest, like Skip.
   */
  const adjust = useCallback(
    (deltaSeconds: number) => {
      if (endsAt === null) return;
      const end = new Date(endsAt.getTime() + deltaSeconds * 1000);
      if (end.getTime() <= Date.now()) skip();
      else runUntil(end);
    },
    [endsAt, runUntil, skip],
  );

  const complete = endsAt !== null && isRestComplete(endsAt, now);
  const remaining = endsAt !== null ? remainingRestSeconds(endsAt, now) : 0;

  useEffect(() => {
    if (endsAt !== null && complete && !alerted) {
      playRestAlert();
      // The server push covers this rest when it was scheduled; showing a
      // local one too would just duplicate it. Otherwise this is the
      // fallback: it reaches the user even if Jim isn't the focused tab,
      // which audio alone doesn't. Fire-and-forget: a rest timer that can't
      // show a system notification still completed.
      if (pushedFor !== endsAt.toISOString()) {
        showLocalNotification(restCompleteMessage()).catch(() => {});
      }
      setAlerted(true);
    }
  }, [complete, endsAt, alerted, pushedFor]);

  return { active: endsAt !== null && !complete, remaining, start, skip, adjust };
}
