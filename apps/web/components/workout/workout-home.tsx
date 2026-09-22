"use client";

import { db } from "@/lib/db/schema";
import { startEmptySession, startSessionFromRoutine } from "@/lib/sessions/start-session";
import { groupRoutinesByFolder } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { UpNextCard } from "./up-next-card";

export function WorkoutHome({ userId }: { userId: string }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  const rawSessions = useLiveQuery(() => db.sessions.toArray(), []);
  const rawRoutines = useLiveQuery(() => db.routines.toArray(), []);

  const activeSession = useMemo(
    () => (rawSessions ?? []).find((session) => !session.endedAt && !session.deletedAt) ?? null,
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

  async function handleStartFromRoutine(routineId: string, routineName: string) {
    setStarting(true);
    const items = await db.routineExercises.where("routineId").equals(routineId).toArray();
    const live = items.filter((item) => !item.deletedAt);
    const sessionId = await startSessionFromRoutine(
      userId,
      { id: routineId, name: routineName },
      live,
    );
    router.push(`/workout/${sessionId}`);
  }

  if (rawSessions === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (activeSession) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold">Workout in progress</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {activeSession.name ?? "An untitled workout"} is still going.
        </p>
        <Link
          href={`/workout/${activeSession.id}`}
          data-ripple
          className="min-h-11 rounded-lg bg-zinc-950 px-4 py-3 text-base font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
        >
          Continue workout
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4">
      <h1 className="text-xl font-semibold">Workout</h1>

      <UpNextCard
        starting={starting}
        onStart={(routineId, routineName) => void handleStartFromRoutine(routineId, routineName)}
      />

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
                    <span className="text-base font-medium">{routine.name}</span>
                    <button
                      type="button"
                      onClick={() => void handleStartFromRoutine(routine.id, routine.name)}
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
    </main>
  );
}
