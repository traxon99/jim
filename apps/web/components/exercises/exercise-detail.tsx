"use client";

import { OneRepMaxChart } from "@/components/history/one-rep-max-chart";
import { db } from "@/lib/db/schema";
import { estimatedOneRepMaxSeries, resolveCurrentRows } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useMemo } from "react";

export function ExerciseDetail({ id, userId }: { id: string; userId: string }) {
  const exercise = useLiveQuery(() => db.exercises.get(id), [id]);

  // Every current (non-superseded, non-deleted) set logged against this
  // exercise, most recent first, paired with which session it belongs to
  // (estimatedOneRepMaxSeries needs that to plot one point per session).
  const resolvedSets = useLiveQuery(async () => {
    const sessionExercises = await db.sessionExercises.where("exerciseId").equals(id).toArray();
    if (sessionExercises.length === 0) return [];

    const sessionIdBySessionExerciseId = new Map(
      sessionExercises.map((se) => [se.id, se.sessionId]),
    );
    const allSets = await db.sets
      .where("sessionExerciseId")
      .anyOf(sessionExercises.map((se) => se.id))
      .toArray();

    return resolveCurrentRows(allSets)
      .filter((set) => !set.deletedAt)
      .map((set) => ({
        ...set,
        sessionId: sessionIdBySessionExerciseId.get(set.sessionExerciseId) ?? set.sessionExerciseId,
      }))
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  }, [id]);

  const history = useMemo(() => resolvedSets?.slice(0, 10), [resolvedSets]);

  const oneRepMaxPoints = useMemo(
    () =>
      estimatedOneRepMaxSeries(
        (resolvedSets ?? []).map((set) => ({
          sessionId: set.sessionId,
          completedAt: set.completedAt,
          weight: set.weight == null ? null : Number(set.weight),
          reps: set.reps,
        })),
      ),
    [resolvedSets],
  );

  if (exercise === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (exercise === null) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-semibold">Exercise not found</h1>
        <Link href="/exercises" className="text-sm font-medium underline underline-offset-4">
          Back to exercises
        </Link>
      </main>
    );
  }

  const canEdit = exercise.ownerId === null || exercise.ownerId === userId;
  const tags = [
    exercise.equipment,
    ...exercise.primaryMuscles,
    ...exercise.secondaryMuscles,
  ].filter((tag): tag is string => Boolean(tag));

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{exercise.name}</h1>
          {exercise.isArchived && (
            <p className="text-xs text-amber-600 dark:text-amber-500">Archived</p>
          )}
        </div>
        {canEdit && (
          <Link
            href={`/exercises/${exercise.id}/edit`}
            className="shrink-0 text-sm font-medium underline underline-offset-4"
          >
            Edit
          </Link>
        )}
      </div>

      {exercise.imageUrls.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {exercise.imageUrls.map((url) => (
            <img
              key={url}
              src={url}
              alt={exercise.name}
              className="h-40 w-auto rounded-lg object-cover"
            />
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {exercise.instructions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold">Instructions</h2>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            {exercise.instructions.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      {oneRepMaxPoints.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold">Estimated 1RM over time</h2>
          <div className="mt-2">
            <OneRepMaxChart points={oneRepMaxPoints} />
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold">Your history</h2>
        {!history || history.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">No sets logged yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {history.map((set) => (
              <li key={set.id} className="flex justify-between py-2">
                <span>
                  {set.weight != null && set.reps != null
                    ? `${set.weight} × ${set.reps}`
                    : set.durationSeconds != null
                      ? `${set.durationSeconds}s`
                      : set.distance != null
                        ? `${set.distance}`
                        : "—"}
                </span>
                <span className="text-zinc-500 dark:text-zinc-500">
                  {set.completedAt.toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
