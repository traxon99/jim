"use client";

import type { RoutineRow } from "@/lib/db/schema";
import { useNextWorkout } from "@/lib/programs/use-next-workout";
import { WEEKDAY_NAMES } from "@/lib/programs/weekdays";
import { useToday } from "@/lib/pwa/use-today";
import { type CycleDay, type ProgramCycle, type ProgramMode, programCycle } from "@jim/core";
import { Check, Moon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

/**
 * The active program's next workout and where today sits in its cycle, for
 * Plan's program card and Lift's week strip (#783). `undefined` while it
 * loads, `null` without an active program.
 */
export function useProgramCycle(weekStart: number) {
  const suggestion = useNextWorkout();
  const today = useToday();
  const cycle = useMemo(() => {
    if (!suggestion) return null;
    return programCycle({
      mode: suggestion.program.mode,
      items: suggestion.items,
      next: suggestion.next,
      now: today,
      weekdayOrder: Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7),
    });
  }, [suggestion, today, weekStart]);
  return { suggestion, cycle, today };
}

/** A day's routines by name, or "Rest". */
export function cycleDayName(day: CycleDay, routinesById: Map<string, RoutineRow>): string {
  if (day.routineIds.length === 0) return "Rest";
  return day.routineIds.map((id) => routinesById.get(id)?.name ?? "Routine").join(" + ");
}

/**
 * The cycle as a row of day circles with today filled in. Wider cycles
 * scroll, keeping today in view (docs/LESSONS.md, #677).
 */
export function ProgramWeekStrip({
  programId,
  mode,
  cycle,
  routinesById,
}: {
  programId: string;
  mode: ProgramMode;
  cycle: ProgramCycle;
  routinesById: Map<string, RoutineRow>;
}) {
  const todayRef = useRef<HTMLLIElement>(null);
  const todayIndex = cycle.todayIndex;
  useEffect(() => {
    if (todayIndex < 0 || !programId) return;
    todayRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [todayIndex, programId]);

  if (cycle.days.length === 0) return null;
  return (
    <ol
      key={programId}
      aria-label="This cycle"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
    >
      {cycle.days.map((day, index) => {
        const name = cycleDayName(day, routinesById);
        const weekday = day.weekday !== null ? WEEKDAY_NAMES[day.weekday].slice(0, 3) : null;
        const isToday = day.state === "today";
        const done = day.state === "past" && mode === "sequence";
        const stateText = isToday ? "today" : day.state === "past" ? "earlier" : "coming up";
        return (
          <li
            // Days have no stable id of their own; the order is the identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-order strip
            key={index}
            ref={isToday ? todayRef : undefined}
            aria-label={`${weekday ?? `Day ${index + 1}`}: ${name}, ${stateText}`}
            className="flex min-w-11 flex-1 shrink-0 flex-col items-center gap-1"
          >
            <span
              aria-hidden="true"
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${
                isToday
                  ? "bg-accent text-accent-foreground"
                  : done
                    ? "bg-zinc-900/10 text-zinc-700 dark:bg-white/15 dark:text-zinc-200"
                    : "border border-zinc-900/15 text-zinc-600 dark:border-white/20 dark:text-zinc-400"
              }`}
            >
              {done ? (
                <Check className="h-4 w-4" strokeWidth={2.25} />
              ) : isToday && day.routineIds.length === 0 ? (
                <Moon className="h-4 w-4" strokeWidth={2} />
              ) : (
                (weekday ?? index + 1)
              )}
            </span>
            <span
              aria-hidden="true"
              className={`w-full truncate text-center text-xs ${
                isToday ? "font-semibold" : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {isToday && mode === "sequence" ? "Today" : name}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
