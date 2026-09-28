"use client";

import { ExerciseForm } from "@/components/exercises/exercise-form";
import { db } from "@/lib/db/schema";
import {
  type ExerciseCategory,
  filterExercises,
  isWarmupExercise,
  preferOwnedExercises,
  searchExercises,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Plus } from "lucide-react";
import { useMemo, useState } from "react";

interface Props {
  userId: string;
  excludeExerciseIds: ReadonlySet<string>;
  /**
   * The picked exercises, in the order they were tapped. Two or more are
   * added together as a superset (issue #269).
   */
  onPick: (exerciseIds: string[]) => void;
  onClose: () => void;
  /** Which tab the picker opens on — e.g. "warmup" inside a warm-up routine. */
  initialCategory?: ExerciseCategory | "all";
  /**
   * "replace" (the ⋯ menu's Replace Exercise, issue #271) picks exactly one:
   * a tap picks it straight away, with no selection or superset.
   */
  mode?: "add" | "replace";
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
  mode = "add",
}: Props) {
  const replacing = mode === "replace";
  const allExercises = useLiveQuery(() => db.exercises.toArray(), []);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ExerciseCategory | "all">(initialCategory);
  // Issue #169: create a missing exercise from here with the same form the
  // Exercises page uses, then add it straight away.
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function toggleSelected(exerciseId: string) {
    if (replacing) {
      onPick([exerciseId]);
      return;
    }
    setSelectedIds((current) =>
      current.includes(exerciseId)
        ? current.filter((selectedId) => selectedId !== exerciseId)
        : [...current, exerciseId],
    );
  }

  const results = useMemo(() => {
    const rows = allExercises ?? [];
    const owned = preferOwnedExercises(rows, userId);
    const filtered = filterExercises(owned, {
      category: category === "all" ? undefined : category,
    }).filter((exercise) => !excludeExerciseIds.has(exercise.id));
    return searchExercises(filtered, query);
  }, [allExercises, userId, query, excludeExerciseIds, category]);

  if (creating) {
    // z-20: above RestTimerBar's z-10 — both are siblings under active-session.tsx's
    // <main>, so without this the timer bar paints over this full-screen view (#227).
    return (
      <div
        className="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-white dark:bg-zinc-950"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <ExerciseForm
          userId={userId}
          mode="new"
          initialName={query.trim()}
          initialCategory={category === "warmup" ? "warmup" : "strength"}
          onSaved={(exercise) => {
            // On its own it's added straight away, as before; alongside
            // others it joins the selection.
            if (selectedIds.length === 0) {
              onPick([exercise.id]);
              return;
            }
            setSelectedIds((current) => [...current, exercise.id]);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      </div>
    );
  }

  // z-20: above RestTimerBar's z-10 — both are siblings under active-session.tsx's
  // <main>, so without this the timer bar paints over this full-screen view (#227).
  return (
    <div
      className="fixed inset-0 z-20 flex flex-col bg-white dark:bg-zinc-950"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">{replacing ? "Replace exercise" : "Add exercise"}</h2>
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
        {!replacing && (
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Pick two or more to add them as a superset.
          </p>
        )}
      </div>

      <ul
        className="flex flex-1 flex-col divide-y divide-zinc-200 overflow-y-auto px-4 dark:divide-zinc-800"
        // Without the footer, the list itself reaches the home indicator.
        style={replacing ? { paddingBottom: "max(12px, env(safe-area-inset-bottom))" } : undefined}
      >
        {results.map((exercise) => {
          const order = selectedIds.indexOf(exercise.id);
          const selected = order !== -1;
          return (
            <li key={exercise.id}>
              <button
                type="button"
                aria-pressed={replacing ? undefined : selected}
                onClick={() => toggleSelected(exercise.id)}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
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
                </span>
                {!replacing && (
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      selected
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    {selected &&
                      (selectedIds.length > 1 ? (
                        order + 1
                      ) : (
                        <Check className="h-4 w-4" strokeWidth={2.5} />
                      ))}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {results.length === 0 && (
          <li className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No exercises match.
          </li>
        )}
        <li>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex min-h-11 w-full items-center gap-2 py-3 text-left text-base font-medium text-accent"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {query.trim() ? `Create “${query.trim()}”` : "New exercise"}
          </button>
        </li>
      </ul>

      {!replacing && (
        <div
          className="shrink-0 border-t border-zinc-200 px-4 pt-3 dark:border-zinc-800"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => onPick(selectedIds)}
            disabled={selectedIds.length === 0}
            className="min-h-11 w-full rounded-lg bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-40"
          >
            {selectedIds.length > 1
              ? `Add ${selectedIds.length} as superset`
              : selectedIds.length === 1
                ? "Add exercise"
                : "Select exercises"}
          </button>
        </div>
      )}
    </div>
  );
}
