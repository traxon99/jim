"use client";

import { DprChips } from "@/components/dpr/dpr-chips";
import { RoutineIcon } from "@/components/routines/routine-icon";
import { db } from "@/lib/db/schema";
import { dprCallsForRoutine } from "@/lib/dpr/calls";
import { useDprContext } from "@/lib/dpr/use-dpr-calls";
import { useNextWorkout } from "@/lib/programs/use-next-workout";
import { WEEKDAY_NAMES } from "@/lib/programs/weekdays";
import type { NextWorkout } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Layers } from "lucide-react";
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
  const routineItems = useLiveQuery(
    async () =>
      routineId
        ? (await db.routineExercises.where("routineId").equals(routineId).toArray()).filter(
            (item) => !item.deletedAt,
          )
        : [],
    [routineId],
  );
  const exerciseCount = routineItems?.length;
  const dprContext = useDprContext();

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
      className="flex flex-col gap-3 rounded-xl border border-accent p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            {heading(next)}
          </span>
          <span className="flex min-w-0 items-center gap-2 text-lg font-semibold">
            <RoutineIcon shape={routine.iconShape} color={routine.iconColor} className="h-5 w-5" />
            <span className="truncate">{routine.name}</span>
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            {program.name}
            {exerciseCount !== undefined &&
              ` · ${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}`}
          </span>
        </div>
        <Link
          href={`/routines/programs/${program.id}`}
          className="flex shrink-0 items-center gap-1 text-sm font-medium underline underline-offset-4"
        >
          <Layers className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          Program
        </Link>
      </div>
      {dprContext && routineItems && (
        <DprChips context={dprContext} calls={dprCallsForRoutine(dprContext, routineItems)} />
      )}
      <button
        type="button"
        onClick={() => onStart(routine.id, routine.name)}
        disabled={starting}
        className="min-h-11 rounded-lg bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-50"
      >
        {next.reason === "next-scheduled" ? "Start it now" : `Start ${routine.name}`}
      </button>
    </section>
  );
}
