"use client";

import { RoutineIconById } from "@/components/routines/routine-icon-by-id";
import { ShareWorkoutButton } from "@/components/workout/share-workout-button";
import { type SessionExerciseRow, type SessionRow, type SetRow, db } from "@/lib/db/schema";
import { buildSessionDetailExercises } from "@/lib/history/session-detail-entries";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { buildWorkoutShareText } from "@/lib/workout/share-text";
import { resolveCurrentRows, summarizeSession } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useMemo } from "react";

interface Props {
  session: SessionRow;
  sessionExercises: SessionExerciseRow[];
}

/**
 * "Finalize: summary of volume, duration and PRs" (STORIES.md S6) — reads
 * entirely from Dexie, so it's available the instant a session ends, with
 * no network round trip (docs/ARCHITECTURE.md §1).
 */
export function SessionSummary({ session, sessionExercises }: Props) {
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const sessionExerciseIds = useMemo(() => sessionExercises.map((se) => se.id), [sessionExercises]);

  const rawSets = useLiveQuery(
    () =>
      sessionExerciseIds.length > 0
        ? db.sets.where("sessionExerciseId").anyOf(sessionExerciseIds).toArray()
        : Promise.resolve<SetRow[]>([]),
    [sessionExerciseIds],
  );
  const rawPersonalRecords = useLiveQuery(() => db.personalRecords.toArray(), []);
  const rawExercises = useLiveQuery(() => db.exercises.toArray(), []);

  const sets = useMemo(
    () => resolveCurrentRows(rawSets ?? []).filter((set) => !set.deletedAt),
    [rawSets],
  );

  const setIds = useMemo(() => new Set(sets.map((set) => set.id)), [sets]);
  const prCount = useMemo(
    () =>
      (rawPersonalRecords ?? []).filter((pr) => !pr.deletedAt && pr.setId && setIds.has(pr.setId))
        .length,
    [rawPersonalRecords, setIds],
  );

  const summary = useMemo(
    () =>
      summarizeSession(
        sets.map((set) => ({
          weight: set.weight == null ? null : Number(set.weight),
          reps: set.reps,
        })),
        session.startedAt,
        session.endedAt ?? new Date(),
        prCount,
      ),
    [sets, session.startedAt, session.endedAt, prCount],
  );

  const exerciseGroups = useMemo(
    () =>
      buildSessionDetailExercises(
        session.id,
        sessionExercises,
        rawExercises ?? [],
        rawSets ?? [],
        rawPersonalRecords ?? [],
      ),
    [session.id, sessionExercises, rawExercises, rawSets, rawPersonalRecords],
  );

  const shareText = useMemo(
    () =>
      buildWorkoutShareText({
        name: session.name,
        startedAt: session.startedAt,
        units: settings.units,
        summary,
        exercises: exerciseGroups,
      }),
    [session.name, session.startedAt, settings.units, summary, exerciseGroups],
  );

  const minutes = Math.round(summary.durationSeconds / 60);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Workout complete</h1>
        {session.name && (
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <RoutineIconById routineId={session.routineId} />
            {session.name}
          </p>
        )}
      </div>

      <dl className="allow-pwa-select grid grid-cols-2 gap-x-10 gap-y-4 text-left">
        <div>
          <dt className="text-xs text-zinc-500 dark:text-zinc-500">Duration</dt>
          <dd className="text-2xl font-semibold">{minutes} min</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500 dark:text-zinc-500">Volume</dt>
          <dd className="text-2xl font-semibold">
            {Math.round(summary.totalVolume).toLocaleString()} {settings.units}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500 dark:text-zinc-500">Sets</dt>
          <dd className="text-2xl font-semibold">{summary.setCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500 dark:text-zinc-500">PRs</dt>
          <dd className="text-2xl font-semibold">{summary.prCount}</dd>
        </div>
      </dl>

      <div className="flex gap-3">
        <ShareWorkoutButton
          title={session.name ?? "Workout"}
          text={shareText}
          className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
        />
        <Link
          href="/workout"
          data-ripple
          className="min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
        >
          Back to workout
        </Link>
      </div>
    </main>
  );
}
