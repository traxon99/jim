"use client";

import { Highlight } from "@/components/highlight";
import { useIncrementalList } from "@/components/use-incremental-list";
import { type ExerciseRow, db } from "@/lib/db/schema";
import { EXERCISE_CATEGORY_TABS, exerciseMetaLine } from "@/lib/exercises/display";
import { formatLastDone } from "@/lib/routines/last-done";
import {
  type ExerciseCategory,
  type ExerciseSortKey,
  type ExerciseUsage,
  buildExerciseUsage,
  dedupeCatalogNames,
  exerciseDisplayName,
  filterExercises,
  preferOwnedExercises,
  searchExercises,
  sortExercisesByUsage,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { SlidersHorizontal } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

/**
 * The exercise catalog's search, filters and sections, shared by the
 * Exercises tab and the Add / Replace exercise picker (issue #710) so the two
 * can't drift apart again.
 */

const SORT_OPTIONS: { value: ExerciseSortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "lastPerformed", label: "Last performed" },
  { value: "frequency", label: "Frequency" },
];

export const CATALOG_SECTION_LABEL =
  "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

interface CatalogOptions {
  userId: string;
  /** Which category the filters start on, e.g. "warmup" inside a warm-up routine. */
  initialCategory?: ExerciseCategory | "all";
  /** Left out of the results, e.g. the exercises already in the workout. */
  excludeExerciseIds?: ReadonlySet<string>;
  /** Only exercises this keeps, e.g. swaps that spare an injury (issue #627). Keep it stable. */
  include?: ((exercise: ExerciseRow) => boolean) | null;
}

export function useExerciseCatalog({
  userId,
  initialCategory = "all",
  excludeExerciseIds,
  include = null,
}: CatalogOptions) {
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
  // Filtering ~870 exercises per keystroke can't hold up typing (#674).
  const deferredQuery = useDeferredValue(query);
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [category, setCategory] = useState<ExerciseCategory | "all">(initialCategory);
  const [sortKey, setSortKey] = useState<ExerciseSortKey>("name");

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
      category: category === "all" ? undefined : category,
    }).filter(
      (exercise) => !excludeExerciseIds?.has(exercise.id) && (!include || include(exercise)),
    );
    const sorted = sortExercisesByUsage(filtered, usageByExerciseId, sortKey);
    const ranked = searchExercises(sorted, deferredQuery);

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
  }, [
    allExercises,
    usageRows,
    userId,
    deferredQuery,
    muscle,
    equipment,
    category,
    sortKey,
    excludeExerciseIds,
    include,
  ]);

  // Issue #330: exercises you've logged come first, most recent first, above
  // the untouched catalog, unless a search or another sort is in charge.
  const sectioned = deferredQuery.trim() === "" && sortKey === "name";
  const yours = useMemo(
    () =>
      sectioned
        ? results
            .filter((exercise) => usage.has(exercise.id))
            .sort(
              (a, b) =>
                (usage.get(b.id)?.lastPerformedAt.getTime() ?? 0) -
                (usage.get(a.id)?.lastPerformedAt.getTime() ?? 0),
            )
        : [],
    [sectioned, results, usage],
  );
  const rest = useMemo(
    () => (sectioned ? results.filter((exercise) => !usage.has(exercise.id)) : results),
    [sectioned, results, usage],
  );
  const restPage = useIncrementalList(
    rest,
    [deferredQuery, muscle, equipment, category, sortKey].join("|"),
  );

  return {
    loaded: allExercises !== undefined,
    query,
    setQuery,
    /** The query the results were filtered by; highlight with this one. */
    deferredQuery,
    searching: deferredQuery.trim() !== "",
    filters: {
      muscle,
      setMuscle,
      equipment,
      setEquipment,
      category,
      setCategory,
      sortKey,
      setSortKey,
      muscleOptions,
      equipmentOptions,
    },
    results,
    usage,
    yours,
    rest,
    restPage,
  };
}

export type ExerciseCatalog = ReturnType<typeof useExerciseCatalog>;
type CatalogExercise = ExerciseCatalog["results"][number];

/** The search box and Filters button, with the filters panel under them when open. */
export function ExerciseCatalogControls({ catalog }: { catalog: ExerciseCatalog }) {
  const { query, setQuery, filters } = catalog;
  const {
    muscle,
    setMuscle,
    equipment,
    setEquipment,
    category,
    setCategory,
    sortKey,
    setSortKey,
    muscleOptions,
    equipmentOptions,
  } = filters;
  // Issue #330: category, muscle, equipment and sort live behind one Filters
  // button so the list starts right under the search box.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters =
    [muscle, equipment, category === "all" ? "" : category].filter(Boolean).length +
    (sortKey === "name" ? 0 : 1);

  return (
    <>
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
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-label={activeFilters > 0 ? `Filters, ${activeFilters} on` : "Filters"}
            className={`flex min-h-11 min-w-12 shrink-0 items-center justify-center rounded-lg border ${
              filtersOpen || activeFilters > 0
                ? "border-accent text-zinc-950 dark:text-zinc-50"
                : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            <SlidersHorizontal className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
          {activeFilters > 0 && (
            <span className="pointer-events-none absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-semibold text-accent-foreground">
              {activeFilters}
            </span>
          )}
        </div>
      </div>

      {filtersOpen && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
            {EXERCISE_CATEGORY_TABS.map((tab) => {
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
              aria-label="Muscle"
              value={muscle}
              onChange={(event) => setMuscle(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">All muscles</option>
              {muscleOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              aria-label="Equipment"
              value={equipment}
              onChange={(event) => setEquipment(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
    </>
  );
}

/**
 * One exercise row's contents: name (search matches marked), the grey meta
 * line, and when you last did it and how often. The caller supplies the
 * Link or button around it.
 */
export function ExerciseCatalogRowContent({
  exercise,
  query,
  used,
  gymNames,
}: {
  exercise: CatalogExercise;
  query: string;
  used: ExerciseUsage | undefined;
  gymNames: ReadonlyMap<string, string> | undefined;
}) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-medium">
          <Highlight text={exerciseDisplayName(exercise)} query={query} />
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-500">
          {exerciseMetaLine(exercise, gymNames)}
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
    </>
  );
}
