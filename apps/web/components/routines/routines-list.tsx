"use client";

import { db } from "@/lib/db/schema";
import {
  formatProgramWeek,
  groupRoutinesByFolder,
  isWarmupRoutine,
  programWeekProgress,
  searchRoutines,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Flame, Layers, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CollapsibleSection } from "./collapsible-section";
import { ExploreList } from "./explore-list";
import { RoutineIcon } from "./routine-icon";

type View = "mine" | "explore";

const VIEWS: { value: View; label: string }[] = [
  { value: "mine", label: "Your Routines" },
  { value: "explore", label: "Explore" },
];

export function RoutinesList({ userId }: { userId: string }) {
  // Your Routines / Explore (issue #141).
  const [view, setView] = useState<View>("mine");
  // Dexie live query: re-renders whenever the local set of routines changes,
  // with no network on the read path (docs/ARCHITECTURE.md §1).
  const allRoutines = useLiveQuery(() => db.routines.toArray(), []);
  const allPrograms = useLiveQuery(() => db.programs.toArray(), []);
  const allRoutineExercises = useLiveQuery(() => db.routineExercises.toArray(), []);
  const allExercises = useLiveQuery(() => db.exercises.toArray(), []);
  // Fuzzy search over Your Routines (issue #219).
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;

  const exerciseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of allRoutineExercises ?? []) {
      if (item.deletedAt) continue;
      counts.set(item.routineId, (counts.get(item.routineId) ?? 0) + 1);
    }
    return counts;
  }, [allRoutineExercises]);

  const groups = useMemo(() => {
    // deletedAt is a tombstone, not a real DELETE (ADR-003's LWW cousin for
    // routines/routine_exercises) — a pulled deletion stays in Dexie with
    // the field set, so every read path must filter it out itself.
    const live = (allRoutines ?? []).filter(
      (routine) => !routine.deletedAt && !isWarmupRoutine(routine),
    );
    return groupRoutinesByFolder(live);
  }, [allRoutines]);

  const warmupRoutines = useMemo(
    () =>
      (allRoutines ?? [])
        .filter((routine) => !routine.deletedAt && isWarmupRoutine(routine))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allRoutines],
  );

  const exerciseNamesByRoutineId = useMemo(() => {
    const nameById = new Map((allExercises ?? []).map((exercise) => [exercise.id, exercise.name]));
    const names = new Map<string, string[]>();
    for (const item of allRoutineExercises ?? []) {
      if (item.deletedAt) continue;
      const name = nameById.get(item.exerciseId);
      if (!name) continue;
      const list = names.get(item.routineId);
      if (list) {
        list.push(name);
      } else {
        names.set(item.routineId, [name]);
      }
    }
    return names;
  }, [allExercises, allRoutineExercises]);

  // Searches warm-ups and strength routines together, flattened out of
  // their folders; equal scores keep the list's usual folder/position order.
  const searchResults = useMemo(() => {
    if (!searching) return [];
    const live = (allRoutines ?? []).filter((routine) => !routine.deletedAt);
    const ordered = groupRoutinesByFolder(live).flatMap((group) => group.routines);
    return searchRoutines(ordered, query, exerciseNamesByRoutineId);
  }, [searching, allRoutines, query, exerciseNamesByRoutineId]);

  const programs = useMemo(
    () =>
      (allPrograms ?? [])
        .filter((program) => !program.deletedAt)
        .sort((a, b) => a.position - b.position),
    [allPrograms],
  );

  if (allRoutines === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Routines</h1>
        <Link
          href="/routines/new"
          aria-label="New routine"
          data-ripple
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"
        >
          <Plus className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>

      <div
        role="tablist"
        aria-label="Routines view"
        className="grid grid-cols-2 gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900"
      >
        {VIEWS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={view === option.value}
            onClick={() => setView(option.value)}
            className={`min-h-9 rounded-md text-sm font-medium ${
              view === option.value
                ? "bg-white shadow-sm dark:bg-zinc-800"
                : "text-zinc-500 dark:text-zinc-500"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {view === "mine" && (
        <input
          type="search"
          inputMode="search"
          placeholder="Search routines"
          aria-label="Search routines"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      )}

      {view === "explore" ? (
        <ExploreList userId={userId} />
      ) : searching ? (
        searchResults.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No routines match “{query.trim()}”.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {searchResults.map((routine) => {
              const exerciseCount = exerciseCounts.get(routine.id) ?? 0;
              const warmup = isWarmupRoutine(routine);
              return (
                <li key={routine.id}>
                  <Link
                    href={`/routines/${routine.id}`}
                    data-ripple
                    className="flex items-center justify-between gap-2 py-3"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {warmup ? (
                        <Flame
                          className="h-4 w-4 shrink-0 text-orange-500 dark:text-orange-400"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                      ) : (
                        <RoutineIcon shape={routine.iconShape} color={routine.iconColor} />
                      )}
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-base font-medium">{routine.name}</span>
                        {(warmup || routine.folder) && (
                          <span className="truncate text-xs text-zinc-500 dark:text-zinc-500">
                            {warmup ? "Warm-up" : routine.folder}
                          </span>
                        )}
                      </span>
                    </span>
                    {exerciseCount > 0 && (
                      <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
                        {exerciseCount} exercise{exerciseCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <>
          <section className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                Programs
              </h2>
              <div className="flex items-center gap-4">
                <Link
                  href="/routines/programs/generate"
                  className="flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                >
                  Build me one
                </Link>
                <Link
                  href="/routines/programs/new"
                  className="flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                >
                  New program
                </Link>
              </div>
            </div>
            {programs.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                Group routines into a program to get your next workout suggested on launch.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/40">
                {programs.map((program) => (
                  <li key={program.id}>
                    <Link
                      href={`/routines/programs/${program.id}`}
                      data-ripple
                      className="-mx-3 flex items-center justify-between gap-2 px-3 py-3"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Layers
                          className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-500"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-base font-medium">{program.name}</span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-500">
                            {program.mode === "weekly" ? "Weekly schedule" : "Sequence"}
                            {program.isActive &&
                              (() => {
                                const progress = programWeekProgress(program, new Date());
                                return progress ? ` · ${formatProgramWeek(progress)}` : "";
                              })()}
                          </span>
                        </span>
                      </span>
                      {program.isActive && (
                        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                          Active
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <CollapsibleSection title="Warm-ups">
            {warmupRoutines.length === 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                Attach a warm-up to any routine and it runs as a timed block at the start of the
                workout. Find ready-made warm-ups and stretches under Explore.
              </p>
            )}
            {warmupRoutines.length > 0 && (
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {warmupRoutines.map((routine) => {
                  const exerciseCount = exerciseCounts.get(routine.id) ?? 0;
                  return (
                    <li key={routine.id}>
                      <Link
                        href={`/routines/${routine.id}`}
                        data-ripple
                        className="flex items-center justify-between gap-2 py-3"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Flame
                            className="h-4 w-4 shrink-0 text-orange-500 dark:text-orange-400"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <span className="truncate text-base font-medium">{routine.name}</span>
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
                          {[
                            routine.warmupMinutes != null ? `${routine.warmupMinutes} min` : null,
                            exerciseCount > 0
                              ? `${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Routines">
            {groups.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
                No routines yet.
              </p>
            ) : (
              <div className="flex flex-col gap-6">
                {groups.map((group) => (
                  <section key={group.folder ?? "__ungrouped"} className="flex flex-col gap-1">
                    {group.folder && (
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                        {group.folder}
                      </h3>
                    )}
                    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                      {group.routines.map((routine) => {
                        const exerciseCount = exerciseCounts.get(routine.id) ?? 0;
                        return (
                          <li key={routine.id}>
                            <Link
                              href={`/routines/${routine.id}`}
                              data-ripple
                              className="flex items-center justify-between gap-2 py-3"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <RoutineIcon shape={routine.iconShape} color={routine.iconColor} />
                                <span className="flex min-w-0 flex-col gap-0.5">
                                  <span className="truncate text-base font-medium">
                                    {routine.name}
                                  </span>
                                  {routine.notes && (
                                    <span className="text-xs text-zinc-500 dark:text-zinc-500">
                                      {routine.notes}
                                    </span>
                                  )}
                                </span>
                              </span>
                              {exerciseCount > 0 && (
                                <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
                                  {exerciseCount} exercise{exerciseCount === 1 ? "" : "s"}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </CollapsibleSection>
        </>
      )}
    </main>
  );
}
