"use client";

import { db } from "@/lib/db/schema";
import { addWarmupTemplate } from "@/lib/routines/warmup-templates";
import {
  WARMUP_TEMPLATES,
  type WarmupTemplate,
  groupRoutinesByFolder,
  isWarmupRoutine,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { ClipboardList, Flame, Layers, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function RoutinesList({ userId }: { userId: string }) {
  const router = useRouter();
  const [addingTemplate, setAddingTemplate] = useState<string | null>(null);
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

  // A template already added (matched by name) isn't offered again.
  const availableTemplates = useMemo(() => {
    const names = new Set(warmupRoutines.map((routine) => routine.name));
    return WARMUP_TEMPLATES.filter((template) => !names.has(template.name));
  }, [warmupRoutines]);

  async function handleAddTemplate(template: WarmupTemplate) {
    setAddingTemplate(template.key);
    try {
      const { routineId, missingSlugs } = await addWarmupTemplate(userId, template);
      if (missingSlugs.length > 0) {
        alert(
          `Added without ${missingSlugs.length} exercise(s) that haven't synced to this device yet.`,
        );
      }
      router.push(`/routines/${routineId}`);
    } finally {
      setAddingTemplate(null);
    }
  }

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

      <section className="flex flex-col gap-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          Warm-ups
        </h2>
        {warmupRoutines.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            Attach a warm-up to any routine and it runs as a timed block at the start of the
            workout. Start from a template:
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
        {availableTemplates.length > 0 && (
          <ul className="flex flex-col gap-2 pt-1">
            {availableTemplates.map((template) => (
              <li
                key={template.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-zinc-300 px-3 py-2 dark:border-zinc-700"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{template.name}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-500">
                    Template · {template.minutes} min · {template.items.length} exercises
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void handleAddTemplate(template)}
                  disabled={addingTemplate != null}
                  className="min-h-11 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
                >
                  {addingTemplate === template.key ? "Adding…" : "Add"}
                </button>
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
                        data-ripple
                        className="flex items-center justify-between gap-2 py-3"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <ClipboardList
                            className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-600"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate text-base font-medium">{routine.name}</span>
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
    </main>
  );
}
