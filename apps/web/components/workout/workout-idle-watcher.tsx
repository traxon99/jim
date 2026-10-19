"use client";

import { db } from "@/lib/db/schema";
import { cancelWorkoutIdlePush, scheduleWorkoutIdlePush } from "@/lib/pwa/push-client";
import { autoEndIdleWorkouts, ownActiveWorkouts } from "@/lib/sessions/workout-idle";
import { DEFAULT_SETTINGS, autoEndWorkoutMinutes } from "@/lib/settings";
import { getDeviceId } from "@/lib/sync/engine";
import { shouldAutoEnd } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";

/** The schedule the server last accepted, so a reload doesn't post it again. */
const PUSH_STORAGE_KEY = "jim:workout-idle-push";

/** How often a foregrounded app checks for an idle workout to end. */
const CHECK_INTERVAL_MS = 60_000;

function readStored(): string | null {
  try {
    return window.localStorage.getItem(PUSH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(PUSH_STORAGE_KEY);
    else window.localStorage.setItem(PUSH_STORAGE_KEY, value);
  } catch {
    // Private mode etc.: the worst case is posting the same schedule again.
  }
}

/**
 * Idle workouts (issue #648), for the lifetime of the shell rather than the
 * workout screen, so they're handled whichever tab is open:
 *
 * - Whenever this device's active workout gets new activity (or the
 *   auto-end setting changes), the server is told, and it pushes "Still
 *   working out?" 10 minutes later and "Workout ended" at the auto-end time.
 *   Those arrive with Jim closed, which is the point.
 * - The phone itself ends a workout idle past the auto-end time: on launch,
 *   on returning to Jim, and once a minute while it's open. The workout
 *   stays phone-owned (ADR-007); the server only sends the alerts.
 */
export function WorkoutIdleWatcher() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  // null once read and missing, so "not loaded yet" stays undefined.
  const settings = useLiveQuery(async () => (await db.settings.get("me")) ?? null, []);
  const autoEnd = autoEndWorkoutMinutes(settings ?? DEFAULT_SETTINGS);
  const workouts = useLiveQuery(
    () => (deviceId ? ownActiveWorkouts(deviceId) : undefined),
    [deviceId],
  );
  const queue = useRef<Promise<void>>(Promise.resolve());
  const ending = useRef(false);

  useEffect(() => {
    getDeviceId()
      .then(setDeviceId)
      .catch(() => {});
  }, []);

  // Most recent first; there's normally only one.
  const current = workouts
    ?.slice()
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())[0];
  const sessionId = current?.session.id ?? null;
  const lastActivityIso = current?.lastActivityAt.toISOString() ?? null;
  const loaded = workouts !== undefined && settings !== undefined;

  useEffect(() => {
    if (!loaded) return;
    const key =
      sessionId && lastActivityIso ? `${sessionId}|${lastActivityIso}|${autoEnd ?? "off"}` : null;
    queue.current = queue.current
      .then(async () => {
        const stored = readStored();
        if (key === stored) return;
        if (sessionId && lastActivityIso && key) {
          const lastActivityAt = new Date(lastActivityIso);
          // One about to be ended here gets no reminder.
          if (!shouldAutoEnd(lastActivityAt, autoEnd, new Date())) {
            const scheduled = await scheduleWorkoutIdlePush({
              sessionId,
              lastActivityAt,
              autoEndMinutes: autoEnd,
            }).catch(() => false);
            if (scheduled) {
              writeStored(key);
              return;
            }
          }
        }
        // No workout, one being ended, or one this device can't get pushes
        // for: drop whatever the server still has scheduled.
        if (stored) {
          await cancelWorkoutIdlePush();
          writeStored(null);
        }
      })
      .catch(() => {});
  }, [loaded, sessionId, lastActivityIso, autoEnd]);

  useEffect(() => {
    if (!deviceId || settings === undefined) return;
    const check = () => {
      if (ending.current) return;
      ending.current = true;
      autoEndIdleWorkouts(deviceId, autoEnd)
        .catch((error: unknown) => console.error("[workout-idle] auto-end failed:", error))
        .finally(() => {
          ending.current = false;
        });
    };
    check();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(interval);
    };
  }, [deviceId, autoEnd, settings]);

  return null;
}
