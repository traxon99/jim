"use client";

import { FloatingCard } from "@/components/floating-card";
import type { ProgramRow, RoutineRow } from "@/lib/db/schema";
import { db } from "@/lib/db/schema";
import { programDayRows } from "@/lib/programs/program-day-rows";
import { setActiveProgram } from "@/lib/programs/set-active";
import { WEEKDAY_NAMES } from "@/lib/programs/weekdays";
import { formatProgramWeek, programWeekProgress } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronRight, Layers, Moon } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { cycleDayName, useProgramCycle } from "./program-week-strip";
import { RoutineIconTile } from "./routine-icon";

interface Props {
  programs: ProgramRow[];
  routinesById: Map<string, RoutineRow>;
  weekStart: number;
}

const SECONDARY_BUTTON =
  "press flex min-h-11 items-center rounded-full bg-zinc-900/[0.06] px-3.5 text-sm font-semibold dark:bg-white/10";

/**
 * The active program, first thing on the Routines page (issue #655): where
 * today sits in its rotation, and its routines with the next one marked.
 * Without an active program it's an invite to pick or build one.
 */
export function ProgramHero({ programs, routinesById, weekStart }: Props) {
  const { suggestion, cycle, today } = useProgramCycle(weekStart);
  const [switching, setSwitching] = useState(false);

  // This week's finished workouts tick off their days on the card (#787).
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);

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

  const { program, routine: nextRoutine } = suggestion;
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

  const rows = cycle
    ? programDayRows({ cycle, mode: program.mode, today, sessions: sessions ?? [] })
    : [];

  return (
    <section
      aria-label="Current program"
      data-tint={nextRoutine?.iconColor ?? "indigo"}
      className="tinted-card surface flex min-w-0 flex-col"
    >
      <div className="flex flex-col px-4 pt-3.5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">
            Following
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
          className="mt-1 flex min-w-0 items-center gap-1 text-[26px] leading-[1.1] font-bold tracking-[-0.024em]"
        >
          <span className="truncate">{program.name}</span>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-zinc-400"
            strokeWidth={2.25}
            aria-hidden="true"
          />
        </Link>
        <p className="program-meta mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{statusLine}</p>
        {weekProgress && !weekProgress.finished && weekProgress.total <= 16 && (
          <div
            role="img"
            aria-label={formatProgramWeek(weekProgress)}
            className="mt-2.5 grid gap-1"
            style={{ gridTemplateColumns: `repeat(${weekProgress.total}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: weekProgress.total }, (_, week) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: one bar per week, fixed order
                key={week}
                className={`h-1.5 rounded-full ${
                  week < weekProgress.week ? "bg-accent" : "bg-zinc-900/10 dark:bg-white/15"
                } ${week === weekProgress.week - 1 ? "opacity-60" : ""}`}
              />
            ))}
          </div>
        )}
      </div>

      {rows.every((row) => row.day.routineIds.length === 0) ? (
        <Link
          href={`/routines/programs/${program.id}`}
          className="px-4 pb-4 text-sm text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
        >
          {program.mode === "weekly"
            ? `Pick days for the routines in ${program.name} to see what's scheduled.`
            : `Add routines to ${program.name} to see what's up next.`}
        </Link>
      ) : (
        // Every day of the cycle, today highlighted (#787). Rows shrink on short
        // screens so the whole card fits Plan's first view (.program-day-row).
        <ol aria-label="This cycle" className="flex flex-col px-4 pb-1.5">
          {rows.map(({ index, day, isToday, done }) => {
            const routine = day.routineIds[0] ? routinesById.get(day.routineIds[0]) : undefined;
            const name = cycleDayName(day, routinesById);
            const label =
              day.weekday !== null ? WEEKDAY_NAMES[day.weekday].slice(0, 3) : `Day ${index + 1}`;
            const rest = day.routineIds.length === 0;
            const content = (
              <>
                <span
                  className={`w-9 shrink-0 text-xs font-semibold uppercase tracking-[0.04em] ${
                    isToday ? "text-accent" : "text-zinc-500 dark:text-zinc-500"
                  }`}
                >
                  {day.weekday !== null ? label : index + 1}
                </span>
                {routine ? (
                  <RoutineIconTile shape={routine.iconShape} color={routine.iconColor} size="sm" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center"
                  >
                    <Moon
                      className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-600"
                      strokeWidth={2}
                    />
                  </span>
                )}
                <span
                  className={`min-w-0 flex-1 truncate text-base tracking-[-0.012em] ${
                    rest ? "text-zinc-400 dark:text-zinc-600" : "font-medium"
                  }`}
                >
                  {name}
                </span>
                {isToday ? (
                  <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-bold tracking-[0.05em] text-accent-foreground">
                    TODAY
                  </span>
                ) : done ? (
                  <Check
                    className="h-[18px] w-[18px] shrink-0 text-green-600 dark:text-green-500"
                    strokeWidth={2.6}
                    aria-hidden="true"
                  />
                ) : null}
              </>
            );
            const rowClass = `program-day-row flex items-center gap-3 ${
              isToday ? "-mx-2.5 rounded-xl bg-zinc-900/[0.05] px-2.5 dark:bg-white/[0.07]" : ""
            }`;
            const ariaLabel = `${label}: ${name}${isToday ? ", today" : done ? ", done" : ""}`;
            return (
              <li
                key={index}
                data-today={isToday || undefined}
                className="border-t border-zinc-900/10 first:border-t-transparent data-today:border-t-transparent dark:border-white/10 [[data-today]+&]:border-t-transparent"
              >
                {routine && !rest ? (
                  <Link
                    href={`/routines/${routine.id}`}
                    data-ripple
                    aria-label={ariaLabel}
                    className={rowClass}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className={rowClass}>{content}</div>
                )}
              </li>
            );
          })}
        </ol>
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
