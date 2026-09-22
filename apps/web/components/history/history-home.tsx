"use client";

import { db } from "@/lib/db/schema";
import { buildSessionListEntries } from "@/lib/history/session-list-entries";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { buildTrainingCalendar, groupSessionsByWeek } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useMemo } from "react";
import { TrainingCalendarHeatmap } from "./training-calendar-heatmap";

export function HistoryHome() {
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;

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

  const weekGroups = useMemo(
    () => groupSessionsByWeek(entries, settings.weekStart),
    [entries, settings.weekStart],
  );

  const calendarDays = useMemo(() => buildTrainingCalendar(entries), [entries]);

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
    <main className="flex flex-1 flex-col gap-6 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">History</h1>
        <nav className="flex gap-4 text-sm font-medium underline underline-offset-4">
          <Link href="/history/prs">PRs</Link>
          <Link href="/history/volume">Volume</Link>
        </nav>
      </div>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          Last 12 weeks
        </h2>
        <TrainingCalendarHeatmap days={calendarDays} weekStart={settings.weekStart} />
      </section>

      {weekGroups.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
          No workouts finished yet.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {weekGroups.map((group) => (
            <section key={group.weekStart.toISOString()} className="flex flex-col gap-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                Week of {group.weekStart.toLocaleDateString()}
              </h2>
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {group.items.map((session) => (
                  <li key={session.id}>
                    <Link
                      href={`/history/${session.id}`}
                      className="flex items-center justify-between gap-2 py-3"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-base font-medium">{session.name}</span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">
                          {session.startedAt.toLocaleDateString()} · {session.setCount} sets
                          {session.prCount > 0
                            ? ` · ${session.prCount} PR${session.prCount > 1 ? "s" : ""}`
                            : ""}
                        </span>
                      </div>
                      <span className="shrink-0 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                        {Math.round(session.totalVolume).toLocaleString()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
