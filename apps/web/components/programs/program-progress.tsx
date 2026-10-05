"use client";

import { db } from "@/lib/db/schema";
import { buildProgramProgressSets } from "@/lib/programs/progress-data";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { type ProgramProgress as Progress, summarizeProgramProgress } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

const COLLAPSED_EXERCISES = 5;

function formatDay(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Summary of the workouts done in a program (issue #414): how many, their
 * sets and volume, and each exercise's estimated 1RM from its first workout
 * in the program to its latest.
 */
export function ProgramProgress({
  routineIds,
  since,
}: {
  routineIds: readonly string[];
  since: Date | null;
}) {
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const [showAll, setShowAll] = useState(false);
  // Primitive deps, since callers pass a fresh array and Date each render.
  const routineKey = routineIds.join(",");
  const sinceTime = since?.getTime() ?? null;

  const data = useLiveQuery(async () => {
    const [sessions, sessionExercises, exercises, sets] = await Promise.all([
      db.sessions.toArray(),
      db.sessionExercises.toArray(),
      db.exercises.toArray(),
      db.sets.toArray(),
    ]);
    const progress: Progress = summarizeProgramProgress({
      routineIds: routineKey ? routineKey.split(",") : [],
      since: sinceTime === null ? null : new Date(sinceTime),
      sessions,
      sets: buildProgramProgressSets(sessions, sessionExercises, exercises, sets),
    });
    const names = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));
    return { progress, names };
  }, [routineKey, sinceTime]);

  if (!data) return null;
  const { progress, names } = data;

  if (progress.workoutCount === 0) {
    return (
      <section className="flex flex-col gap-1 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Progress</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          No workouts logged in this program yet. Your progress shows up here as you train.
        </p>
      </section>
    );
  }

  const exercises = showAll ? progress.exercises : progress.exercises.slice(0, COLLAPSED_EXERCISES);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Progress</h2>
        {progress.firstAt && progress.lastAt && (
          <p className="min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-500">
            {formatDay(progress.firstAt)}
            {progress.workoutCount > 1 && ` – ${formatDay(progress.lastAt)}`}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="min-w-0">
          <dt className="text-xs text-zinc-500 dark:text-zinc-500">Workouts</dt>
          <dd className="text-lg font-semibold">{progress.workoutCount}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-zinc-500 dark:text-zinc-500">Sets</dt>
          <dd className="text-lg font-semibold">{progress.setCount}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-zinc-500 dark:text-zinc-500">Volume</dt>
          <dd className="truncate text-lg font-semibold">
            {Math.round(progress.totalVolume).toLocaleString()} {settings.units}
          </dd>
        </div>
      </dl>

      {progress.exercises.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Estimated 1RM, first workout → latest
          </p>
          <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
            {exercises.map((exercise) => {
              const change = Math.round(exercise.change);
              return (
                <li
                  key={exercise.exerciseId}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {names.get(exercise.exerciseId) ?? "Exercise"}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">
                      {exercise.sessionCount} {exercise.sessionCount === 1 ? "workout" : "workouts"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular-nums">
                      {Math.round(exercise.firstE1rm)} → {Math.round(exercise.latestE1rm)}{" "}
                      {settings.units}
                    </p>
                    {exercise.sessionCount > 1 && (
                      <p
                        className={`text-xs tabular-nums ${
                          change > 0
                            ? "text-emerald-600 dark:text-emerald-500"
                            : change < 0
                              ? "text-red-600 dark:text-red-500"
                              : "text-zinc-500 dark:text-zinc-500"
                        }`}
                      >
                        {change > 0 ? `+${change}` : change === 0 ? "No change" : change}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {progress.exercises.length > COLLAPSED_EXERCISES && (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="min-h-11 self-start text-sm font-medium underline underline-offset-4"
            >
              {showAll ? "Show fewer" : `Show all ${progress.exercises.length} exercises`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
