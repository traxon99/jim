"use client";

import { FloatingCard } from "@/components/floating-card";
import type { ProgramRow, RoutineRow } from "@/lib/db/schema";
import { setActiveProgram } from "@/lib/programs/set-active";
import { useNextWorkout } from "@/lib/programs/use-next-workout";
import { WEEKDAY_NAMES } from "@/lib/programs/weekdays";
import { useToday } from "@/lib/pwa/use-today";
import {
  type CycleDay,
  formatProgramWeek,
  isWarmupRoutine,
  programCycle,
  programWeekProgress,
} from "@jim/core";
import { Check, ChevronRight, Layers, Moon, Repeat } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { RoutineIcon } from "./routine-icon";

interface Props {
  programs: ProgramRow[];
  routinesById: Map<string, RoutineRow>;
  exerciseCounts: Map<string, number>;
  weekStart: number;
}

const SECONDARY_BUTTON =
  "flex min-h-11 items-center rounded-full border border-zinc-900/10 bg-white/60 px-3 text-sm font-medium dark:border-white/15 dark:bg-zinc-900/60";

function exerciseCountLabel(count: number): string {
  return `${count} exercise${count === 1 ? "" : "s"}`;
}

/**
 * The active program, first thing on the Routines page (issue #655): where
 * today sits in its rotation, and its routines with the next one marked.
 * Without an active program it's an invite to pick or build one.
 */
export function ProgramHero({ programs, routinesById, exerciseCounts, weekStart }: Props) {
  const suggestion = useNextWorkout();
  const today = useToday();
  const [switching, setSwitching] = useState(false);

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

  // Each routine once, in program order; rest days and warm-ups stay out.
  const programRoutines = useMemo(() => {
    if (!suggestion) return [];
    const seen = new Set<string>();
    const list: RoutineRow[] = [];
    for (const item of [...suggestion.items].sort((a, b) => a.position - b.position)) {
      if (item.deletedAt || !item.routineId || seen.has(item.routineId)) continue;
      const routine = routinesById.get(item.routineId);
      if (!routine || routine.deletedAt || isWarmupRoutine(routine)) continue;
      seen.add(item.routineId);
      list.push(routine);
    }
    return list;
  }, [suggestion, routinesById]);

  // Still loading: hold the space quietly rather than flash the invite.
  if (suggestion === undefined) return null;

  const switchCard = switching && (
    <SwitchProgramCard
      programs={programs}
      activeId={suggestion?.program.id ?? null}
      onClose={() => setSwitching(false)}
    />
  );

  if (!suggestion) {
    return (
      <section
        aria-label="Program"
        className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700"
      >
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2 text-base font-semibold">
            <Layers className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {programs.length > 0 ? "No active program" : "Follow a program"}
          </span>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            A program puts your routines in order and suggests what&apos;s next.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {programs.length > 0 && (
            <button type="button" onClick={() => setSwitching(true)} className={SECONDARY_BUTTON}>
              Choose a program
            </button>
          )}
          <Link href="/routines/programs/new" data-ripple className={SECONDARY_BUTTON}>
            New program
          </Link>
          <Link href="/routines/programs/generate" data-ripple className={SECONDARY_BUTTON}>
            Build me one
          </Link>
        </div>
        {switchCard}
      </section>
    );
  }

  const { program, next, routine: nextRoutine } = suggestion;
  const todayDay = cycle && cycle.todayIndex >= 0 ? cycle.days[cycle.todayIndex] : undefined;
  const restingToday = todayDay !== undefined && todayDay.routineIds.length === 0;
  const weekProgress = programWeekProgress(program, today);
  const statusLine = [
    program.mode === "weekly" ? "Weekly" : "Rotation",
    program.mode === "sequence" && cycle && cycle.todayIndex >= 0
      ? `Day ${cycle.todayIndex + 1} of ${cycle.days.length}`
      : null,
    weekProgress ? formatProgramWeek(weekProgress) : null,
    restingToday ? "Rest today" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const dayName = (day: CycleDay): string => {
    if (day.routineIds.length === 0) return "Rest";
    return day.routineIds.map((id) => routinesById.get(id)?.name ?? "Routine").join(" + ");
  };

  return (
    <section
      aria-label="Current program"
      data-tint={nextRoutine?.iconColor ?? "indigo"}
      className="tinted-card flex min-w-0 flex-col gap-4 rounded-xl border border-accent p-4"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Current program
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setSwitching(true)} className={SECONDARY_BUTTON}>
              Switch
            </button>
            <Link
              href={`/routines/programs/${program.id}/edit`}
              data-ripple
              className={SECONDARY_BUTTON}
            >
              Edit
            </Link>
          </div>
        </div>
        <Link
          href={`/routines/programs/${program.id}`}
          className="flex min-w-0 items-center gap-1 text-xl font-semibold"
        >
          <span className="truncate">{program.name}</span>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-zinc-500"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </Link>
        <p className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <Repeat className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
          {statusLine}
        </p>
      </div>

      {cycle && cycle.days.length > 0 && (
        <ol aria-label="This cycle" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {cycle.days.map((day, index) => {
            const name = dayName(day);
            const weekday = day.weekday !== null ? WEEKDAY_NAMES[day.weekday].slice(0, 3) : null;
            const isToday = day.state === "today";
            const done = day.state === "past" && program.mode === "sequence";
            const stateText = isToday ? "today" : day.state === "past" ? "earlier" : "coming up";
            return (
              <li
                // Days have no stable id of their own; the order is the identity.
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-order strip
                key={index}
                aria-label={`${weekday ?? `Day ${index + 1}`}: ${name}, ${stateText}`}
                className="flex w-14 min-w-14 shrink-0 flex-col items-center gap-1"
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
                  {isToday && program.mode === "sequence" ? "Today" : name}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {programRoutines.length === 0 ? (
        <Link
          href={`/routines/programs/${program.id}`}
          className="text-sm text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
        >
          {program.mode === "weekly"
            ? `Pick days for the routines in ${program.name} to see what's scheduled.`
            : `Add routines to ${program.name} to see what's up next.`}
        </Link>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-900/10 rounded-lg bg-white/50 px-3 dark:divide-white/10 dark:bg-zinc-900/40">
          {programRoutines.map((routine) => {
            const isNext = next?.routineId === routine.id;
            const warmup = routine.warmupRoutineId
              ? routinesById.get(routine.warmupRoutineId)
              : undefined;
            const meta = [
              exerciseCountLabel(exerciseCounts.get(routine.id) ?? 0),
              warmup && !warmup.deletedAt ? warmup.name : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={routine.id}>
                <Link
                  href={`/routines/${routine.id}`}
                  data-ripple
                  className="-mx-3 flex items-center gap-3 px-3 py-3"
                >
                  <RoutineIcon
                    shape={routine.iconShape}
                    color={routine.iconColor}
                    className="h-5 w-5"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-base font-medium">{routine.name}</span>
                      {isNext && (
                        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                          Next
                        </span>
                      )}
                    </span>
                    <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                      {meta}
                    </span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-zinc-500"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {switchCard}
    </section>
  );
}

/** Pick which program is active, or open one to look before switching. */
function SwitchProgramCard({
  programs,
  activeId,
  onClose,
}: {
  programs: ProgramRow[];
  activeId: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <FloatingCard labelledBy={titleId} onClose={onClose}>
      {(close) => {
        async function choose(programId: string) {
          if (busy) return;
          if (programId === activeId) {
            close();
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await setActiveProgram(programId);
            close();
          } catch {
            setError("Couldn't switch programs. Try again.");
          } finally {
            setBusy(false);
          }
        }

        return (
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4 text-left">
            <h2 id={titleId} className="text-base font-semibold">
              Switch program
            </h2>
            <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
              {programs.map((program) => (
                <li key={program.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={program.id === activeId}
                    onClick={() => void choose(program.id)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-3 text-left disabled:opacity-50"
                  >
                    <Layers
                      className="h-4 w-4 shrink-0 text-zinc-500"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-base font-medium">{program.name}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-500">
                        {program.mode === "weekly" ? "Weekly schedule" : "Rotation"}
                        {program.id === activeId && " · Active"}
                      </span>
                    </span>
                  </button>
                  <Link
                    href={`/routines/programs/${program.id}`}
                    onClick={close}
                    className="flex min-h-11 shrink-0 items-center text-sm font-medium underline underline-offset-4"
                  >
                    View
                  </Link>
                </li>
              ))}
            </ul>
            {error && <p className="text-xs text-red-600 dark:text-red-500">{error}</p>}
            <div className="flex flex-wrap items-center gap-x-4">
              <Link
                href="/routines/programs/new"
                onClick={close}
                className="flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
              >
                New program
              </Link>
              <Link
                href="/routines/programs/generate"
                onClick={close}
                className="flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
              >
                Build me one
              </Link>
              {activeId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setActiveProgram(null)
                      .then(close)
                      .catch(() => setError("Couldn't stop the program. Try again."))
                      .finally(() => setBusy(false));
                  }}
                  className="ml-auto flex min-h-11 items-center text-sm font-medium text-zinc-500"
                >
                  Stop program
                </button>
              )}
            </div>
          </div>
        );
      }}
    </FloatingCard>
  );
}
