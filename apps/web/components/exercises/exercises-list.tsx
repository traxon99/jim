"use client";

import { db } from "@/lib/db/schema";
import { filterExercises, preferOwnedExercises, searchExercises } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useMemo, useState } from "react";

export function ExercisesList({ userId }: { userId: string }) {
  // Dexie live query: re-renders whenever the local catalog changes (a pull
  // landing, a new custom exercise), with no network on the read path.
  const allExercises = useLiveQuery(() => db.exercises.toArray(), []);
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");

  const { results, muscleOptions, equipmentOptions } = useMemo(() => {
    const rows = allExercises ?? [];
    const owned = preferOwnedExercises(rows, userId);
    const filtered = filterExercises(owned, {
      muscle: muscle || undefined,
      equipment: equipment || undefined,
    });
    const ranked = searchExercises(filtered, query);

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
    };
  }, [allExercises, userId, query, muscle, equipment]);

  if (allExercises === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Exercises</h1>
        <Link
          href="/exercises/new"
          className="rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
        >
          New
        </Link>
      </div>

      <input
        type="search"
        inputMode="search"
        placeholder="Search exercises"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />

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

      {results.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
          No exercises match.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {results.map((exercise) => (
            <li key={exercise.id}>
              <Link href={`/exercises/${exercise.id}`} className="flex flex-col gap-0.5 py-3">
                <span className="text-base font-medium">{exercise.name}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">
                  {[exercise.equipment, ...exercise.primaryMuscles].filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
