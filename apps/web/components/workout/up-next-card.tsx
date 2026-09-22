"use client";

import { db } from "@/lib/db/schema";
import { useNextWorkout } from "@/lib/programs/use-next-workout";
import { WEEKDAY_NAMES } from "@/lib/programs/weekdays";
import type { NextWorkout } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";

interface Props {
  starting: boolean;
  onStart: (routineId: string, routineName: string) => void;
}

function dayLabel(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (date.getTime() === tomorrow.getTime()) return "Tomorrow";
  return WEEKDAY_NAMES[date.getDay()];
}

function heading(next: NextWorkout): string {
  switch (next.reason) {
    case "sequence":
      return "Up next";
    case "scheduled-today":
      return "Today";
    case "next-scheduled": {
      const when = next.date ? dayLabel(next.date) : "Next";
      return `${next.doneToday ? "Done for today" : "Rest day"} · Next: ${when}`;
    }
  }
}

/** The active program's suggested workout, with a one-tap start. */
export function UpNextCard({ starting, onStart }: Props) {
  const suggestion = useNextWorkout();
  const routineId = suggestion?.routine?.id;
  const exerciseCount = useLiveQuery(
    async () =>
      routineId
        ? (await db.routineExercises.where("routineId").equals(routineId).toArray()).filter(
            (item) => !item.deletedAt,
          ).length
        : 0,
    [routineId],
  );

  if (suggestion === undefined) return null;

  if (suggestion === null) {
    return (
      <Link
        href="/routines/programs/new"
        data-ripple
        className="rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
      >
        Set up a program to get your next workout suggested here.
      </Link>
    );
  }

  const { program, next, routine } = suggestion;

  if (!next || !routine) {
    return (
      <Link
        href={`/routines/programs/${program.id}`}
        data-ripple
        className="rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
      >
        {program.mode === "weekly"
          ? `Pick days for the routines in ${program.name} to see what's scheduled.`
          : `Add routines to ${program.name} to see what's up next.`}
      </Link>
    );
  }

  return (
    <section
      aria-label="Suggested workout"
      className="flex flex-col gap-3 rounded-xl border border-zinc-950 p-4 dark:border-zinc-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            {heading(next)}
          </span>
          <span className="truncate text-lg font-semibold">{routine.name}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            {program.name}
            {exerciseCount !== undefined &&
              ` · ${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}`}
          </span>
        </div>
        <Link
          href={`/routines/programs/${program.id}`}
          className="shrink-0 text-sm font-medium underline underline-offset-4"
        >
          Program
        </Link>
      </div>
      <button
        type="button"
        onClick={() => onStart(routine.id, routine.name)}
        disabled={starting}
        className="min-h-11 rounded-lg bg-zinc-950 px-4 py-3 text-base font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
      >
        {next.reason === "next-scheduled" ? "Start it now" : `Start ${routine.name}`}
      </button>
    </section>
  );
}
