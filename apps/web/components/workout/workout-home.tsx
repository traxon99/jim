"use client";

import { BlockEndCard } from "@/components/dpr/block-end-card";
import { DprChips } from "@/components/dpr/dpr-chips";
import { TryDprCard } from "@/components/dpr/try-dpr-card";
import { RoutineIcon } from "@/components/routines/routine-icon";
import { type RoutineExerciseRow, db } from "@/lib/db/schema";
import { dprCallsForRoutine } from "@/lib/dpr/calls";
import { useDprContext } from "@/lib/dpr/use-dpr-calls";
import { startEmptySession, startSessionFromRoutine } from "@/lib/sessions/start-session";
import { type SessionIntensity, groupRoutinesByFolder } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PreWorkoutSheet } from "./pre-workout-sheet";
import { UpNextCard } from "./up-next-card";

export function WorkoutHome({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [starting, setStarting] = useState(false);
  // The routine waiting on the pre-workout sheet (issue #235, DPR only).
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null);

  const rawSessions = useLiveQuery(() => db.sessions.toArray(), []);
  const rawRoutines = useLiveQuery(() => db.routines.toArray(), []);
  const dprContext = useDprContext();
  const itemsByRoutine = useLiveQuery(async () => {
    const map = new Map<string, RoutineExerciseRow[]>();
    if (!dprContext) return map;
    for (const item of await db.routineExercises.toArray()) {
      const list = map.get(item.routineId) ?? [];
      list.push(item);
      map.set(item.routineId, list);
    }
    return map;
  }, [dprContext !== null]);

  const activeSession = useMemo(
    () => (rawSessions ?? []).find((session) => !session.endedAt && !session.deletedAt) ?? null,
    [rawSessions],
  );

  // This tab stays mounted (hidden) even when another tab is showing
  // (components/tabbed-shell.tsx), so gate the redirect on actually being
  // the visible tab — otherwise landing on /history with a session already
  // in progress would silently bounce the user to /workout.
  useEffect(() => {
    if (activeSession && pathname === "/workout") router.replace(`/workout/${activeSession.id}`);
  }, [activeSession, pathname, router]);

  // Because this tab stays mounted, `starting` would otherwise survive the
  // round trip into the session and back (e.g. cancelling the workout),
  // leaving the Start buttons permanently disabled. Once navigation has
  // actually left /workout, the flag has done its job of blocking a double
  // start — clear it so the buttons work again whenever we return here.
  useEffect(() => {
    if (pathname !== "/workout") {
      setStarting(false);
      setPreview(null);
    }
  }, [pathname]);

  const completedSessionCount = useMemo(
    () => (rawSessions ?? []).filter((session) => session.endedAt && !session.deletedAt).length,
    [rawSessions],
  );

  const routineGroups = useMemo(
    () => groupRoutinesByFolder((rawRoutines ?? []).filter((routine) => !routine.deletedAt)),
    [rawRoutines],
  );

  async function handleStartEmpty() {
    setStarting(true);
    const sessionId = await startEmptySession(userId);
    router.push(`/workout/${sessionId}`);
  }

  const closePreview = useCallback(() => setPreview(null), []);

  // DPR users see today's targets and pick an intensity first (issue #235);
  // everyone else starts straight away.
  function handleChooseRoutine(routineId: string, routineName: string) {
    if (dprContext) setPreview({ id: routineId, name: routineName });
    else void handleStartFromRoutine(routineId, routineName, null);
  }

  async function handleStartFromRoutine(
    routineId: string,
    routineName: string,
    intensity: SessionIntensity | null,
  ) {
    setStarting(true);
    const items = await db.routineExercises.where("routineId").equals(routineId).toArray();
    const live = items.filter((item) => !item.deletedAt);
    const routine = await db.routines.get(routineId);
    const sessionId = await startSessionFromRoutine(
      userId,
      { id: routineId, name: routineName, warmupRoutineId: routine?.warmupRoutineId },
      live,
      undefined,
      intensity,
    );
    router.push(`/workout/${sessionId}`);
  }

  if (rawSessions === undefined || activeSession) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4">
      <h1 className="text-xl font-semibold">Workout</h1>

      <TryDprCard completedSessionCount={completedSessionCount} />
      <BlockEndCard context={dprContext} />

      <UpNextCard starting={starting} onStart={handleChooseRoutine} />

      <button
        type="button"
        onClick={() => void handleStartEmpty()}
        disabled={starting}
        className="min-h-11 rounded-lg border border-zinc-300 px-4 py-3 text-base font-medium disabled:opacity-50 dark:border-zinc-700"
      >
        Start empty workout
      </button>

      {routineGroups.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Start from a routine
          </h2>
          {routineGroups.map((group) => (
            <section key={group.folder ?? "__ungrouped"} className="flex flex-col gap-1">
              {group.folder && (
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                  {group.folder}
                </h3>
              )}
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {group.routines.map((routine) => (
                  <li key={routine.id} className="flex items-center justify-between gap-2 py-3">
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <RoutineIcon shape={routine.iconShape} color={routine.iconColor} />
                        <span className="truncate text-base font-medium">{routine.name}</span>
                      </span>
                      {dprContext && (
                        <DprChips
                          context={dprContext}
                          calls={dprCallsForRoutine(
                            dprContext,
                            itemsByRoutine?.get(routine.id) ?? [],
                          )}
                          max={2}
                        />
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleChooseRoutine(routine.id, routine.name)}
                      disabled={starting}
                      className="min-h-11 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
                    >
                      Start
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {preview && dprContext && (
        <PreWorkoutSheet
          context={dprContext}
          routineId={preview.id}
          routineName={preview.name}
          starting={starting}
          onStart={(intensity) => void handleStartFromRoutine(preview.id, preview.name, intensity)}
          onCancel={closePreview}
        />
      )}
    </main>
  );
}
