"use client";

import { FLOATING_BUTTON, PAGE_BODY, PageHeader } from "@/components/page-header";
import { RoutineIcon } from "@/components/routines/routine-icon";
import { db } from "@/lib/db/schema";
import { buildSessionHighlights, formatHighlightSet } from "@/lib/history/session-highlights";
import { buildSessionListEntries } from "@/lib/history/session-list-entries";
import { formatMinutes } from "@/lib/home/stats";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { buildTrainingCalendar, dateKey, startOfMonth } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3, LineChart, Trophy } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TrainingCalendarMonth } from "./training-calendar-month";

const DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const CARD_DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** Recent workouts shown at a time; "Show more" adds this many again. */
const PAGE_SIZE = 20;
/** Exercises listed on a card before "+N more". */
const CARD_EXERCISES = 4;

export function HistoryHome() {
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  // Issue #328: History opens on recent workouts; tapping a day narrows the
  // list to that day rather than being the only way in.
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);

  const rawSessions = useLiveQuery(() => db.sessions.toArray(), []);
  const rawSessionExercises = useLiveQuery(() => db.sessionExercises.toArray(), []);
  const rawExercises = useLiveQuery(() => db.exercises.toArray(), []);
  const rawSets = useLiveQuery(() => db.sets.toArray(), []);
  const rawPersonalRecords = useLiveQuery(() => db.personalRecords.toArray(), []);
  const rawRoutines = useLiveQuery(() => db.routines.toArray(), []);

  const entries = useMemo(
    () =>
      buildSessionListEntries(
        rawSessions ?? [],
        rawSessionExercises ?? [],
        rawExercises ?? [],
        rawSets ?? [],
        rawPersonalRecords ?? [],
      ),
    [rawSessions, rawSessionExercises, rawExercises, rawSets, rawPersonalRecords],
  );

  // Session id → the routine it was started from, so the list can show that
  // routine's icon next to the session name (issue #154).
  const routineBySessionId = useMemo(() => {
    const routinesById = new Map((rawRoutines ?? []).map((routine) => [routine.id, routine]));
    const map = new Map<string, NonNullable<typeof rawRoutines>[number]>();
    for (const session of rawSessions ?? []) {
      const routine = session.routineId ? routinesById.get(session.routineId) : undefined;
      if (routine) map.set(session.id, routine);
    }
    return map;
  }, [rawSessions, rawRoutines]);

  const calendarDays = useMemo(() => buildTrainingCalendar(entries), [entries]);

  const highlightsBySession = useMemo(
    () => buildSessionHighlights(rawSessionExercises ?? [], rawExercises ?? [], rawSets ?? []),
    [rawSessionExercises, rawExercises, rawSets],
  );

  const listedSessions = useMemo(() => {
    const key = selectedDate ? dateKey(selectedDate) : null;
    return entries
      .filter((session) => key === null || dateKey(session.startedAt) === key)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }, [entries, selectedDate]);
  const visibleSessions = selectedDate ? listedSessions : listedSessions.slice(0, shown);

  const loading =
    rawSessions === undefined ||
    rawSessionExercises === undefined ||
    rawExercises === undefined ||
    rawSets === undefined ||
    rawPersonalRecords === undefined;

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="History" />
      {/* Beside the title these ran off the right edge (issue #327); as their
          own row of three equal pills they all fit at 393px. */}
      <nav className="grid grid-cols-3 gap-2 px-4">
        <Link
          href="/history/prs"
          className={`${FLOATING_BUTTON} whitespace-nowrap px-3 text-sm font-medium`}
        >
          <Trophy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          PRs
        </Link>
        <Link
          href="/history/volume"
          className={`${FLOATING_BUTTON} whitespace-nowrap px-3 text-sm font-medium`}
        >
          <BarChart3 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Volume
        </Link>
        <Link
          href="/portal"
          className={`${FLOATING_BUTTON} whitespace-nowrap px-3 text-sm font-medium`}
        >
          <LineChart className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Analysis
        </Link>
      </nav>
      <div className={PAGE_BODY}>
        <section>
          <TrainingCalendarMonth
            month={visibleMonth}
            weekStart={settings.weekStart}
            days={calendarDays}
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              // Tapping the selected day again goes back to all workouts.
              const same = selectedDate !== null && dateKey(selectedDate) === dateKey(date);
              setSelectedDate(same ? null : date);
              setVisibleMonth(startOfMonth(date));
            }}
            onPrevMonth={() =>
              setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
            onNextMonth={() =>
              setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex min-h-11 items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              {selectedDate ? DAY_FORMAT.format(selectedDate) : "Recent workouts"}
            </h2>
            {selectedDate && (
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="min-h-11 px-2 text-sm font-medium underline underline-offset-4"
              >
                Show all
              </button>
            )}
          </div>
          {visibleSessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
              {entries.length === 0 ? "No workouts finished yet." : "No workouts on this day."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visibleSessions.map((session) => {
                const routine = routineBySessionId.get(session.id);
                const highlights = highlightsBySession.get(session.id) ?? [];
                const minutes = session.endedAt
                  ? (session.endedAt.getTime() - session.startedAt.getTime()) / 60_000
                  : null;
                return (
                  <li key={session.id}>
                    <Link
                      href={`/history/${session.id}`}
                      data-ripple
                      className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="flex min-w-0 items-center gap-2 text-base font-semibold">
                          {routine && (
                            <RoutineIcon shape={routine.iconShape} color={routine.iconColor} />
                          )}
                          <span className="truncate">{session.name}</span>
                        </span>
                        <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
                          {CARD_DATE_FORMAT.format(session.startedAt)}
                          {minutes !== null && ` · ${formatMinutes(minutes)}`} ·{" "}
                          {Math.round(session.totalVolume).toLocaleString()} {settings.units}
                          {session.prCount > 0
                            ? ` · ${session.prCount} PR${session.prCount > 1 ? "s" : ""}`
                            : ""}
                        </span>
                      </div>
                      {highlights.length > 0 && (
                        <ul className="flex flex-col gap-0.5 text-sm">
                          {highlights.slice(0, CARD_EXERCISES).map((highlight, index) => (
                            <li
                              // biome-ignore lint/suspicious/noArrayIndexKey: an exercise can repeat in a workout
                              key={index}
                              className="flex justify-between gap-3"
                            >
                              <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">
                                {highlight.exerciseName}
                              </span>
                              <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-500">
                                {formatHighlightSet(highlight)}
                              </span>
                            </li>
                          ))}
                          {highlights.length > CARD_EXERCISES && (
                            <li className="text-xs text-zinc-500 dark:text-zinc-500">
                              +{highlights.length - CARD_EXERCISES} more
                            </li>
                          )}
                        </ul>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {!selectedDate && listedSessions.length > shown && (
            <button
              type="button"
              onClick={() => setShown((count) => count + PAGE_SIZE)}
              className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
            >
              Show more
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
