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

  const groups = useMemo(() => {
    // deletedAt is a tombstone, not a real DELETE (ADR-003's LWW cousin for
    // routines/routine_exercises) — a pulled deletion stays in Dexie with
    // the field set, so every read path must filter it out itself.
    const live = (allRoutines ?? []).filter((routine) => !routine.deletedAt);
    return groupRoutinesByFolder(live);
  }, [allRoutines]);

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
                {group.routines.map((routine) => (
                  <li key={routine.id}>
                    <Link href={`/routines/${routine.id}`} className="flex flex-col gap-0.5 py-3">
                      <span className="text-base font-medium">{routine.name}</span>
                      {routine.notes && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">
                          {routine.notes}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
