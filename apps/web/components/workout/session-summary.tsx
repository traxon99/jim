"use client";

import { type SessionExerciseRow, type SessionRow, type SetRow, db } from "@/lib/db/schema";
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
  const sessionExerciseIds = useMemo(() => sessionExercises.map((se) => se.id), [sessionExercises]);

  const rawSets = useLiveQuery(
    () =>
      sessionExerciseIds.length > 0
        ? db.sets.where("sessionExerciseId").anyOf(sessionExerciseIds).toArray()
        : Promise.resolve<SetRow[]>([]),
    [sessionExerciseIds],
  );
  const rawPersonalRecords = useLiveQuery(() => db.personalRecords.toArray(), []);

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

  const minutes = Math.round(summary.durationSeconds / 60);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Workout complete</h1>
        {session.name && (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{session.name}</p>
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
            {Math.round(summary.totalVolume).toLocaleString()}
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

      <Link
        href="/workout"
        data-ripple
        className="min-h-11 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
      >
        Back to workout
      </Link>
    </main>
  );
}
