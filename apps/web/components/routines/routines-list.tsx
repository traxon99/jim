"use client";

import { db } from "@/lib/db/schema";
import { groupRoutinesByFolder } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useMemo } from "react";

export function RoutinesList({ userId: _userId }: { userId: string }) {
  // Dexie live query: re-renders whenever the local set of routines changes,
  // with no network on the read path (docs/ARCHITECTURE.md §1).
  const allRoutines = useLiveQuery(() => db.routines.toArray(), []);
  const allPrograms = useLiveQuery(() => db.programs.toArray(), []);
  const allRoutineExercises = useLiveQuery(() => db.routineExercises.toArray(), []);

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
    const live = (allRoutines ?? []).filter((routine) => !routine.deletedAt);
    return groupRoutinesByFolder(live);
  }, [allRoutines]);

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
          className="rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
        >
          New
        </Link>
      </div>

      <section className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Programs
          </h2>
          <Link
            href="/routines/programs/new"
            className="flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
          >
            New program
          </Link>
        </div>
        {programs.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            Group routines into a program to get your next workout suggested on launch.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {programs.map((program) => (
              <li key={program.id}>
                <Link
                  href={`/routines/programs/${program.id}`}
                  className="flex items-center justify-between gap-2 py-3"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-base font-medium">{program.name}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">
                      {program.mode === "weekly" ? "Weekly schedule" : "Sequence"}
                    </span>
                  </span>
                  {program.isActive && (
                    <span className="rounded-full bg-zinc-950 px-2 py-0.5 text-xs font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950">
                      Active
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
          No routines yet.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.folder ?? "__ungrouped"} className="flex flex-col gap-1">
              {group.folder && (
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                  {group.folder}
                </h2>
              )}
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {group.routines.map((routine) => {
                  const exerciseCount = exerciseCounts.get(routine.id) ?? 0;
                  return (
                    <li key={routine.id}>
                      <Link
                        href={`/routines/${routine.id}`}
                        className="flex items-center justify-between gap-2 py-3"
                      >
                        <span className="flex flex-col gap-0.5">
                          <span className="text-base font-medium">{routine.name}</span>
                          {routine.notes && (
                            <span className="text-xs text-zinc-500 dark:text-zinc-500">
                              {routine.notes}
                            </span>
                          )}
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
    </main>
  );
}
