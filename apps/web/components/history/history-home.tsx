"use client";

import { LoadingText } from "@/components/loading-text";
import { FLOATING_BUTTON, PAGE_BODY, PageHeader, SECTION_LABEL } from "@/components/page-header";
import { RoutineIconTile } from "@/components/routines/routine-icon";
import { SickDayToggle } from "@/components/sick-days/sick-day-controls";
import { db } from "@/lib/db/schema";
import { buildSessionHighlights, formatHighlightSet } from "@/lib/history/session-highlights";
import { useSessionList } from "@/lib/history/use-session-list";
import { groupSessionsByWeek, summarizeWeek } from "@/lib/history/week-sections";
import { formatCompact, formatMinutes } from "@/lib/home/stats";
import { useToday } from "@/lib/pwa/use-today";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { useSickDays } from "@/lib/sick-days/use-sick-days";
import { buildTrainingCalendar, dateKey, startOfMonth } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3, CalendarDays, ChevronRight, Dumbbell, Search, Trophy } from "lucide-react";
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
/**
 * Exercises listed on a card before "+N more". High enough that a normal
 * session shows every exercise (#787); only very long ones fold.
 */
const CARD_EXERCISES = 8;

/** "4 workouts · 3h 52m · 48.1k lb · 2 PRs" beside a week's heading (#783, #787). */
function weekSummaryLine(
  summary: { workouts: number; minutes: number; volume: number; prs: number },
  units: string,
): string {
  return [
    `${summary.workouts} workout${summary.workouts === 1 ? "" : "s"}`,
    summary.minutes > 0 ? formatMinutes(summary.minutes) : null,
    `${formatCompact(Math.round(summary.volume))} ${units}`,
    summary.prs > 0 ? `${summary.prs} PR${summary.prs === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function HistoryHome({ userId }: { userId: string }) {
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  // Issue #328: History opens on recent workouts; tapping a day narrows the
  // list to that day rather than being the only way in.
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  // History is just your workouts by week (#783); the calendar and search
  // open from the header, and the stats live on Insights.
  const [calendarOpen, setCalendarOpen] = useState(false);
  // "This week" moves on when iOS resumes the app in a new week (#523).
  const today = useToday();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const list = useSessionList();
  const sickDays = useSickDays();
  const rawSessions = list?.sessions;
  const rawSessionExercises = list?.sessionExercises;
  const rawExercises = list?.exercises;
  const rawSets = list?.sets;
  const rawRoutines = useLiveQuery(() => db.routines.toArray(), []);
  const entries = useMemo(() => list?.entries ?? [], [list]);

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
  const needle = searchOpen ? query.trim().toLowerCase() : "";
  const searchResults = useMemo(() => {
    if (!needle) return [];
    return listedSessions.filter(
      (session) =>
        (session.name ?? "").toLowerCase().includes(needle) ||
        (highlightsBySession.get(session.id) ?? []).some((highlight) =>
          highlight.exerciseName.toLowerCase().includes(needle),
        ),
    );
  }, [needle, listedSessions, highlightsBySession]);
  const visibleSessions = selectedDate
    ? listedSessions
    : needle
      ? searchResults
      : listedSessions.slice(0, shown);

  // Weeks over the shown page; each summary counts the whole week.
  const weeks = useMemo(() => {
    const all = groupSessionsByWeek(listedSessions, settings.weekStart, today);
    const totals = new Map(all.map((week) => [week.start.getTime(), summarizeWeek(week.sessions)]));
    return groupSessionsByWeek(visibleSessions, settings.weekStart, today).map((week) => ({
      ...week,
      summary: totals.get(week.start.getTime()) ?? summarizeWeek(week.sessions),
    }));
  }, [listedSessions, visibleSessions, settings.weekStart, today]);

  const loading = list === undefined;

  const renderCard = (session: (typeof visibleSessions)[number]) => {
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
          className="surface press flex flex-col px-3.5 pt-3 pb-2"
        >
          <div className="flex items-center gap-3">
            {routine ? (
              <RoutineIconTile shape={routine.iconShape} color={routine.iconColor} />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-zinc-900/[0.06] text-zinc-500 dark:bg-white/10"
              >
                <Dumbbell className="h-4 w-4" strokeWidth={2} />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[17px] leading-tight font-semibold tracking-[-0.018em]">
                  {session.name}
                </span>
                {session.prCount > 0 && (
                  <span className="flex h-[22px] shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 text-xs font-bold text-amber-800 dark:bg-amber-400/20 dark:text-amber-300">
                    <Trophy className="h-3 w-3" strokeWidth={2.4} aria-hidden="true" />
                    {session.prCount} PR{session.prCount > 1 ? "s" : ""}
                  </span>
                )}
              </span>
              <span className="truncate text-[13.5px] tabular-nums text-zinc-500 dark:text-zinc-400">
                {CARD_DATE_FORMAT.format(session.startedAt)}
                {minutes !== null && ` · ${formatMinutes(minutes)}`} ·{" "}
                {Math.round(session.totalVolume).toLocaleString()} {settings.units}
              </span>
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-zinc-400"
              strokeWidth={2.25}
              aria-hidden="true"
            />
          </div>
          {highlights.length > 0 && (
            // Every exercise with its best set, in compact rows (#787).
            <ul className="mt-2.5 ml-11 flex flex-col border-t border-zinc-900/10 pt-1 text-[14.5px] dark:border-white/10">
              {highlights.slice(0, CARD_EXERCISES).map((highlight, index) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: an exercise can repeat in a workout
                  key={index}
                  className="flex min-h-6 items-center justify-between gap-3"
                >
                  <span className="min-w-0 truncate">{highlight.exerciseName}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatHighlightSet(highlight)}
                  </span>
                </li>
              ))}
              {highlights.length > CARD_EXERCISES && (
                <li className="flex min-h-6 items-center text-sm text-zinc-500 dark:text-zinc-400">
                  {highlights.length - CARD_EXERCISES} more exercise
                  {highlights.length - CARD_EXERCISES === 1 ? "" : "s"}
                </li>
              )}
            </ul>
          )}
        </Link>
      </li>
    );
  };

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <LoadingText />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title="History"
        actions={
          <>
            <button
              type="button"
              aria-label="Calendar"
              aria-pressed={calendarOpen}
              data-ripple
              onClick={() => {
                setCalendarOpen((open) => !open);
                setSelectedDate(null);
              }}
              className={FLOATING_BUTTON}
            >
              <CalendarDays className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <Link
              href="/history/insights"
              aria-label="Insights"
              data-ripple
              className={FLOATING_BUTTON}
            >
              <BarChart3 className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </Link>
            <button
              type="button"
              aria-label="Search workouts"
              aria-pressed={searchOpen}
              data-ripple
              onClick={() => {
                setSearchOpen((open) => !open);
                setQuery("");
              }}
              className={FLOATING_BUTTON}
            >
              <Search className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </>
        }
      />
      <div className={PAGE_BODY}>
        {searchOpen && (
          <label className="flex min-w-0 items-center gap-2 rounded-xl bg-zinc-900/[0.07] px-3 dark:bg-white/[0.12]">
            <Search
              className="h-4 w-4 shrink-0 text-zinc-500"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="sr-only">Search workouts</span>
            <input
              type="search"
              inputMode="search"
              placeholder="Routine or exercise"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent py-3 text-base text-zinc-950 outline-none dark:text-zinc-50"
            />
          </label>
        )}
        {calendarOpen && (
          <section aria-label="Calendar">
            <TrainingCalendarMonth
              month={visibleMonth}
              weekStart={settings.weekStart}
              days={calendarDays}
              sickDays={sickDays}
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
        )}

        <section className="flex flex-col gap-2">
          {(selectedDate || needle) && (
            <div className="flex min-h-11 items-center justify-between gap-2">
              <h2 className={`${SECTION_LABEL} px-1`}>
                {selectedDate
                  ? DAY_FORMAT.format(selectedDate)
                  : `${searchResults.length} workout${searchResults.length === 1 ? "" : "s"}`}
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
          )}
          {/* Any past day can be marked sick (issue #779). */}
          {selectedDate && <SickDayToggle userId={userId} day={dateKey(selectedDate)} />}
          {visibleSessions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                {entries.length === 0
                  ? "No workouts finished yet."
                  : needle && !selectedDate
                    ? `Nothing matches “${query.trim()}”.`
                    : "No workouts on this day."}
              </p>
              {/* A brand-new user needs somewhere to go from here (#686). */}
              {entries.length === 0 && (
                <Link
                  href="/workout"
                  data-ripple
                  className="flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
                >
                  Start a workout
                </Link>
              )}
            </div>
          ) : selectedDate || needle ? (
            <ul className="flex flex-col gap-2">{visibleSessions.map(renderCard)}</ul>
          ) : (
            // Your workouts by week, each with a one-line summary (#783).
            <div className="flex flex-col gap-5">
              {weeks.map((week) => (
                <section
                  key={week.start.getTime()}
                  aria-label={week.label}
                  className="flex flex-col gap-2"
                >
                  <div className="flex min-w-0 items-baseline justify-between gap-3 px-1">
                    <h3 className={`${SECTION_LABEL} shrink-0`}>{week.label}</h3>
                    <p className="min-w-0 truncate text-[13px] tabular-nums text-zinc-500 dark:text-zinc-400">
                      {weekSummaryLine(week.summary, settings.units)}
                    </p>
                  </div>
                  <ul className="flex flex-col gap-2">{week.sessions.map(renderCard)}</ul>
                </section>
              ))}
            </div>
          )}
          {!selectedDate && !needle && listedSessions.length > shown && (
            <button
              type="button"
              onClick={() => setShown((count) => count + PAGE_SIZE)}
              className="surface press min-h-11 px-4 text-[15px] font-semibold"
            >
              Show more
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
