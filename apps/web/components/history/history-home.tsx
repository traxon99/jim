"use client";

import { db } from "@/lib/db/schema";
import { buildSessionListEntries } from "@/lib/history/session-list-entries";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { buildTrainingCalendar, dateKey, startOfMonth } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TrainingCalendarMonth } from "./training-calendar-month";

const DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function HistoryHome() {
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));

  const rawSessions = useLiveQuery(() => db.sessions.toArray(), []);
  const rawSessionExercises = useLiveQuery(() => db.sessionExercises.toArray(), []);
  const rawExercises = useLiveQuery(() => db.exercises.toArray(), []);
  const rawSets = useLiveQuery(() => db.sets.toArray(), []);
  const rawPersonalRecords = useLiveQuery(() => db.personalRecords.toArray(), []);

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

  const calendarDays = useMemo(() => buildTrainingCalendar(entries), [entries]);

  const selectedDaySessions = useMemo(() => {
    const key = dateKey(selectedDate);
    return entries
      .filter((session) => dateKey(session.startedAt) === key)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }, [entries, selectedDate]);

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

  const isToday = dateKey(selectedDate) === dateKey(new Date());

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">History</h1>
        <nav className="flex gap-4 text-sm font-medium underline underline-offset-4">
          <Link href="/history/prs">PRs</Link>
          <Link href="/history/volume">Volume</Link>
        </nav>
      </div>

      <section>
        <TrainingCalendarMonth
          month={visibleMonth}
          weekStart={settings.weekStart}
          days={calendarDays}
          selectedDate={selectedDate}
          onSelectDate={(date) => {
            setSelectedDate(date);
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

      <section className="flex flex-col gap-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          {isToday ? "Today" : DAY_FORMAT.format(selectedDate)}
        </h2>
        {selectedDaySessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
            {entries.length === 0 ? "No workouts finished yet." : "No workouts on this day."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {selectedDaySessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/history/${session.id}`}
                  data-ripple
                  className="flex items-center justify-between gap-2 py-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-base font-medium">{session.name}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">
                      {session.startedAt.toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      · {session.setCount} sets
                      {session.prCount > 0
                        ? ` · ${session.prCount} PR${session.prCount > 1 ? "s" : ""}`
                        : ""}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {Math.round(session.totalVolume).toLocaleString()} {settings.units}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
