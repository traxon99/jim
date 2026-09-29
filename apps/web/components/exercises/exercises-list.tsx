"use client";

import { FLOATING_BUTTON, PAGE_BODY, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db/schema";
import {
  type ExerciseCategory,
  type ExerciseSortKey,
  buildExerciseUsage,
  filterExercises,
  isWarmupExercise,
  preferOwnedExercises,
  searchExercises,
  sortExercisesByUsage,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const SORT_OPTIONS: { value: ExerciseSortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "lastPerformed", label: "Last performed" },
  { value: "frequency", label: "Frequency" },
];

export function ExercisesList({ userId }: { userId: string }) {
  // Dexie live query: re-renders whenever the local catalog changes (a pull
  // landing, a new custom exercise), with no network on the read path.
  const allExercises = useLiveQuery(() => db.exercises.toArray(), []);

  // Every (non-deleted) sessionExercise joined with its (non-deleted)
  // session's startedAt — the same shape previous-set-lookup.ts builds —
  // flattened here so buildExerciseUsage can derive last-performed/frequency.
  const usageRows = useLiveQuery(async () => {
    const sessionExercises = (await db.sessionExercises.toArray()).filter((se) => !se.deletedAt);
    if (sessionExercises.length === 0) return [];

    const sessionIds = [...new Set(sessionExercises.map((se) => se.sessionId))];
    const sessions = await db.sessions.bulkGet(sessionIds);
    const sessionById = new Map(sessions.filter((s) => s != null).map((s) => [s.id, s]));

    return sessionExercises.flatMap((se) => {
      const session = sessionById.get(se.sessionId);
      if (!session || session.deletedAt) return [];
      return [{ exerciseId: se.exerciseId, sessionId: se.sessionId, startedAt: session.startedAt }];
    });
  }, []);

  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [category, setCategory] = useState<ExerciseCategory | "">("");
  const [sortKey, setSortKey] = useState<ExerciseSortKey>("name");

  const { results, muscleOptions, equipmentOptions, usage } = useMemo(() => {
    const rows = allExercises ?? [];
    const owned = preferOwnedExercises(rows, userId);
    const filtered = filterExercises(owned, {
      muscle: muscle || undefined,
      equipment: equipment || undefined,
      category: category || undefined,
    });
    const usageByExerciseId = buildExerciseUsage(usageRows ?? []);
    const sorted = sortExercisesByUsage(filtered, usageByExerciseId, sortKey);
    const ranked = searchExercises(sorted, query);

    const muscleSet = new Set<string>();
    const equipmentSet = new Set<string>();
    for (const exercise of owned) {
      for (const m of exercise.primaryMuscles) muscleSet.add(m);
      for (const m of exercise.secondaryMuscles) muscleSet.add(m);
      if (exercise.equipment) equipmentSet.add(exercise.equipment);
    }

    return {
      results: ranked,
      muscleOptions: [...muscleSet].sort(),
      equipmentOptions: [...equipmentSet].sort(),
      usage: usageByExerciseId,
    };
  }, [allExercises, usageRows, userId, query, muscle, equipment, category, sortKey]);

  if (allExercises === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title="Exercises"
        actions={
          <Link
            href="/exercises/new"
            aria-label="New exercise"
            data-ripple
            className={FLOATING_BUTTON}
          >
            <Plus className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
          </Link>
        }
      />
      <div className={PAGE_BODY}>
        <input
          type="search"
          inputMode="search"
          placeholder="Search exercises"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />

        <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
          {(
            [
              { value: "", label: "All" },
              { value: "strength", label: "Strength" },
              { value: "warmup", label: "Warm-ups" },
            ] as const
          ).map((tab) => {
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

        <div className="flex gap-2">
          <select
            value={muscle}
            onChange={(event) => setMuscle(event.target.value)}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">All muscles</option>
            {muscleOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={equipment}
            onChange={(event) => setEquipment(event.target.value)}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">All equipment</option>
            {equipmentOptions.map((eq) => (
              <option key={eq} value={eq}>
                {eq}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-500">
          Sort by
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as ExerciseSortKey)}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {results.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No exercises match.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {results.map((exercise) => {
              const frequency = usage.get(exercise.id)?.frequency ?? 0;
              return (
                <li key={exercise.id}>
                  <Link
                    href={`/exercises/${exercise.id}`}
                    data-ripple
                    className="flex items-center justify-between gap-2 py-3"
                  >
                    <span className="flex flex-col gap-0.5">
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
                    <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
                      {frequency > 0 ? `${frequency}×` : "—"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
