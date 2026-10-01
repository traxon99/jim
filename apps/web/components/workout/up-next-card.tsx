"use client";

import { DprWorkoutBadge } from "@/components/dpr/dpr-workout-badge";
import { RoutineIcon } from "@/components/routines/routine-icon";
import { db } from "@/lib/db/schema";
import { dprCallsForRoutine } from "@/lib/dpr/calls";
import { useDprContext } from "@/lib/dpr/use-dpr-calls";
import { isRestDay, readRestDaySkipped, writeRestDaySkipped } from "@/lib/programs/rest-day";
import { useNextWorkout } from "@/lib/programs/use-next-workout";
import { WEEKDAY_NAMES } from "@/lib/programs/weekdays";
import type { NextWorkout } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Layers, Moon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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

/** Heading for a workout to do — rest days get their own card instead. */
function heading(next: NextWorkout): string {
  switch (next.reason) {
    case "sequence":
    case "rest":
      return "Up next";
    case "scheduled-today":
      return "Today";
    case "next-scheduled":
      if (!next.doneToday) return "Up next";
      return `Done for today · Next: ${next.date ? dayLabel(next.date) : "Next"}`;
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
  // Bumped to re-render after the skip is written; the skip itself lives in
  // localStorage so it holds for the rest of the day on this device.
  const [, setSkipVersion] = useState(0);

  // Without a program there's nothing to suggest; the invite to set one up
  // lives on the Routines tab, not above your routines here (issue #329).
  if (!suggestion) return null;

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

  const resting = isRestDay(next) && !readRestDaySkipped(program.id);
  const setSkipped = (skipped: boolean) => {
    writeRestDaySkipped(program.id, skipped);
    setSkipVersion((version) => version + 1);
  };

  // A rest day is the whole card; the next workout waits behind a skip.
  if (resting) {
    return (
      <section
        aria-label="Rest day"
        className="flex flex-col gap-3 rounded-xl border border-accent p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              {program.name}
            </span>
            <span className="flex items-center gap-2 text-lg font-semibold">
              <Moon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              Rest day
            </span>
            <span className="truncate text-xs text-zinc-500 dark:text-zinc-500">
              Next: {routine.name}
              {next.date && ` · ${dayLabel(next.date)}`}
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
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Take it easy today. Recovery is part of the program.
        </p>
        <button
          type="button"
          onClick={() => setSkipped(true)}
          className="min-h-11 rounded-lg border border-zinc-300 px-4 py-3 text-base font-medium dark:border-zinc-700"
        >
          Skip rest day
        </button>
      </section>
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
        <DprWorkoutBadge
          context={dprContext}
          calls={dprCallsForRoutine(dprContext, routineItems)}
          routineName={routine.name}
        />
      )}
      <button
        type="button"
        onClick={() => onStart(routine.id, routine.name)}
        disabled={starting}
        className="min-h-11 rounded-lg bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-50"
      >
        {next.reason === "next-scheduled" && next.doneToday
          ? "Start it now"
          : `Start ${routine.name}`}
      </button>
      {isRestDay(next) && (
        <button
          type="button"
          onClick={() => setSkipped(false)}
          className="self-center text-sm font-medium text-zinc-500 underline underline-offset-4 dark:text-zinc-500"
        >
          Rest instead
        </button>
      )}
    </section>
  );
}
