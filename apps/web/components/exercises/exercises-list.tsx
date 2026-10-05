"use client";

import { LoadingText } from "@/components/loading-text";
import { FLOATING_BUTTON, PAGE_BODY, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db/schema";
import { formatLastDone } from "@/lib/routines/last-done";
import {
  type ExerciseCategory,
  type ExerciseSortKey,
  buildExerciseUsage,
  dedupeCatalogNames,
  filterExercises,
  isCardioExercise,
  isWarmupExercise,
  preferOwnedExercises,
  searchExercises,
  sortExercisesByUsage,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, SlidersHorizontal } from "lucide-react";
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
  // Issue #330: category, muscle, equipment and sort live behind one Filters
  // button so the list starts right under the search box.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters =
    [muscle, equipment, category].filter(Boolean).length + (sortKey === "name" ? 0 : 1);

  const { results, muscleOptions, equipmentOptions, usage } = useMemo(() => {
    const rows = allExercises ?? [];
    const usageByExerciseId = buildExerciseUsage(usageRows ?? []);
    const owned = dedupeCatalogNames(
      preferOwnedExercises(rows, userId),
      new Set(usageByExerciseId.keys()),
    );
    const filtered = filterExercises(owned, {
      muscle: muscle || undefined,
      equipment: equipment || undefined,
      category: category || undefined,
    });
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

  // Issue #330: exercises you've logged come first, most recent first, above
  // the untouched catalog, unless a search or another sort is in charge.
  const sectioned = query.trim() === "" && sortKey === "name";
  const yours = sectioned
    ? results
        .filter((exercise) => usage.has(exercise.id))
        .sort(
          (a, b) =>
            (usage.get(b.id)?.lastPerformedAt.getTime() ?? 0) -
            (usage.get(a.id)?.lastPerformedAt.getTime() ?? 0),
        )
    : [];
  const rest = sectioned ? results.filter((exercise) => !usage.has(exercise.id)) : results;

  function renderRow(exercise: (typeof results)[number]) {
    const used = usage.get(exercise.id);
    return (
      <li key={exercise.id}>
        <Link
          href={`/exercises/${exercise.id}`}
          data-ripple
          className="flex items-center justify-between gap-2 py-3"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-base font-medium">{exercise.name}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-500">
              {[
                isWarmupExercise(exercise) ? "warm-up" : null,
                isCardioExercise(exercise) ? "cardio" : null,
                exercise.equipment,
                ...exercise.primaryMuscles,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          {/* When you last did it and how often, in place of the old bare
              "—" (issue #330); nothing for exercises you haven't logged. */}
          {used && (
            <span className="shrink-0 text-right text-xs text-zinc-500 dark:text-zinc-500">
              {formatLastDone(used.lastPerformedAt)}
              <br />
              {used.frequency}×
            </span>
          )}
        </Link>
      </li>
    );
  }

  if (allExercises === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <LoadingText />
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
        <div className="flex gap-2">
          <input
            type="search"
            inputMode="search"
            placeholder="Search exercises"
            aria-label="Search exercises"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-label={activeFilters > 0 ? `Filters, ${activeFilters} on` : "Filters"}
            className={`relative flex min-h-11 min-w-12 shrink-0 items-center justify-center rounded-lg border ${
              filtersOpen || activeFilters > 0
                ? "border-accent text-zinc-950 dark:text-zinc-50"
                : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            <SlidersHorizontal className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            {activeFilters > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-semibold text-accent-foreground">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {filtersOpen && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
              {(
                [
                  { value: "", label: "All" },
                  { value: "strength", label: "Strength" },
                  { value: "warmup", label: "Warm-ups" },
                  { value: "cardio", label: "Cardio" },
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
          </div>
        )}

        {results.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No exercises match.
          </p>
        ) : (
          <>
            {yours.length > 0 && (
              <section className="flex flex-col gap-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                  Your exercises
                </h2>
                <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                  {yours.map(renderRow)}
                </ul>
              </section>
            )}
            {rest.length > 0 && (
              <section className="flex flex-col gap-1">
                {yours.length > 0 && (
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                    All exercises
                  </h2>
                )}
                <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                  {rest.map(renderRow)}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
