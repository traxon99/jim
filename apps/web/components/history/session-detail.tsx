"use client";

import { db } from "@/lib/db/schema";
import { buildSessionDetailExercises } from "@/lib/history/session-detail-entries";
import { resolveCurrentRows, summarizeSession } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useMemo } from "react";

const PR_LABELS: Record<string, string> = {
  "1rm": "1RM",
  weight: "Weight",
  volume: "Volume",
  reps_at_weight: "Reps",
};

export function SessionDetail({ id }: { id: string }) {
  const session = useLiveQuery(async () => (await db.sessions.get(id)) ?? null, [id]);
  const rawSessionExercises = useLiveQuery(
    () => db.sessionExercises.where("sessionId").equals(id).toArray(),
    [id],
  );
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const rawSets = useLiveQuery(async () => {
    const sessionExerciseIds = (
      await db.sessionExercises.where("sessionId").equals(id).toArray()
    ).map((se) => se.id);
    if (sessionExerciseIds.length === 0) return [];
    return db.sets.where("sessionExerciseId").anyOf(sessionExerciseIds).toArray();
  }, [id]);
  const rawPersonalRecords = useLiveQuery(() => db.personalRecords.toArray(), []);

  const groups = useMemo(
    () =>
      buildSessionDetailExercises(
        id,
        rawSessionExercises ?? [],
        exercises ?? [],
        rawSets ?? [],
        rawPersonalRecords ?? [],
      ),
    [id, rawSessionExercises, exercises, rawSets, rawPersonalRecords],
  );

  const summary = useMemo(() => {
    if (!session) return null;
    const sets = resolveCurrentRows(rawSets ?? []).filter((set) => !set.deletedAt);
    // A count of achieved PR rows, not distinct sets — mirrors
    // SessionSummary's prCount (S6): one set can beat several PR kinds at once.
    const prCount = groups.reduce(
      (count, group) =>
        count + group.sets.reduce((setCount, set) => setCount + set.prKinds.length, 0),
      0,
    );
    return summarizeSession(
      sets.map((set) => ({
        weight: set.weight == null ? null : Number(set.weight),
        reps: set.reps,
      })),
      session.startedAt,
      session.endedAt ?? new Date(),
      prCount,
    );
  }, [session, rawSets, groups]);

  if (session === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (session === null) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-semibold">Workout not found</h1>
        <Link href="/history" className="text-sm font-medium underline underline-offset-4">
          Back to history
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-semibold">{session.name ?? "Untitled workout"}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          {session.startedAt.toLocaleString()}
        </p>
      </div>

      {summary && (
        <dl className="grid grid-cols-4 gap-2 text-center">
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-500">Duration</dt>
            <dd className="text-lg font-semibold">
              {Math.round(summary.durationSeconds / 60)} min
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-500">Volume</dt>
            <dd className="text-lg font-semibold">
              {Math.round(summary.totalVolume).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-500">Sets</dt>
            <dd className="text-lg font-semibold">{summary.setCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-500">PRs</dt>
            <dd className="text-lg font-semibold">{summary.prCount}</dd>
          </div>
        </dl>
      )}

      {session.notes && <p className="text-sm text-zinc-700 dark:text-zinc-300">{session.notes}</p>}

      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.sessionExerciseId} className="flex flex-col gap-1">
            <Link
              href={`/exercises/${group.exerciseId}`}
              className="text-base font-semibold underline-offset-4 hover:underline"
            >
              {group.exerciseName}
            </Link>
            {group.notes && (
              <p className="text-xs text-zinc-500 dark:text-zinc-500">{group.notes}</p>
            )}
            <ul className="flex flex-col divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              {group.sets.map((set) => (
                <li key={set.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2">
                    <span className="text-zinc-500 dark:text-zinc-500">#{set.setIndex + 1}</span>
                    <span>
                      {set.weight != null && set.reps != null
                        ? `${set.weight} × ${set.reps}`
                        : set.durationSeconds != null
                          ? `${set.durationSeconds}s`
                          : set.distance != null
                            ? `${set.distance}`
                            : "—"}
                    </span>
                    {set.kind !== "working" && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs capitalize text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {set.kind}
                      </span>
                    )}
                  </span>
                  {set.prKinds.length > 0 && (
                    <span className="flex gap-1">
                      {set.prKinds.map((kind) => (
                        <span
                          key={kind}
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-400"
                        >
                          PR · {PR_LABELS[kind] ?? kind}
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
