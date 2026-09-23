"use client";

import { db } from "@/lib/db/schema";
import {
  type ExerciseCategory,
  filterExercises,
  isWarmupExercise,
  preferOwnedExercises,
  searchExercises,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";

interface Props {
  userId: string;
  excludeExerciseIds: ReadonlySet<string>;
  onPick: (exerciseId: string, exerciseName: string) => void;
  onClose: () => void;
  /** Which tab the picker opens on — e.g. "warmup" inside a warm-up routine. */
  initialCategory?: ExerciseCategory | "all";
}

const CATEGORY_TABS = [
  { value: "all", label: "All" },
  { value: "strength", label: "Strength" },
  { value: "warmup", label: "Warm-ups" },
] as const;

export function ExercisePicker({
  userId,
  excludeExerciseIds,
  onPick,
  onClose,
  initialCategory = "all",
}: Props) {
  const allExercises = useLiveQuery(() => db.exercises.toArray(), []);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ExerciseCategory | "all">(initialCategory);

  const results = useMemo(() => {
    const rows = allExercises ?? [];
    const owned = preferOwnedExercises(rows, userId);
    const filtered = filterExercises(owned, {
      category: category === "all" ? undefined : category,
    }).filter((exercise) => !excludeExerciseIds.has(exercise.id));
    return searchExercises(filtered, query);
  }, [allExercises, userId, query, excludeExerciseIds, category]);

  return (
    <div
      className="fixed inset-0 z-10 flex flex-col bg-white dark:bg-zinc-950"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Add exercise</h2>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-2 text-sm font-medium underline underline-offset-4"
        >
          Cancel
        </button>
      </div>

      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
          {CATEGORY_TABS.map((tab) => {
            const selected = category === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setCategory(tab.value)}
                className={`min-h-11 rounded-lg px-2 text-sm font-medium ${
                  selected
                    ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <input
          type="search"
          inputMode="search"
          placeholder="Search exercises"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <ul className="flex flex-1 flex-col divide-y divide-zinc-200 overflow-y-auto px-4 dark:divide-zinc-800">
        {results.map((exercise) => (
          <li key={exercise.id}>
            <button
              type="button"
              onClick={() => onPick(exercise.id, exercise.name)}
              className="flex w-full flex-col gap-0.5 py-3 text-left"
            >
              <span className="text-base font-medium">{exercise.name}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-500">
                {[
                  isWarmupExercise(exercise) ? "warm-up" : null,
                  exercise.equipment,
                  ...exercise.primaryMuscles,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No exercises match.
          </li>
        )}
      </ul>
    </div>
  );
}
