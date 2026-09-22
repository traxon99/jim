"use client";

import { db } from "@/lib/db/schema";
import { buildSessionListEntries } from "@/lib/history/session-list-entries";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { buildTrainingCalendar, groupSessionsByMonth, groupSessionsByWeek } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TrainingCalendarHeatmap } from "./training-calendar-heatmap";

type HistoryGrouping = "week" | "month";

const GROUPING_OPTIONS: { value: HistoryGrouping; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

export function HistoryHome() {
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const [grouping, setGrouping] = useState<HistoryGrouping>("week");

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

  const monthGroups = useMemo(() => groupSessionsByMonth(entries), [entries]);

  const groups = useMemo(
    () =>
      grouping === "week"
        ? weekGroups.map((group) => ({
            key: group.weekStart,
            label: `Week of ${group.weekStart.toLocaleDateString()}`,
            items: group.items,
          }))
        : monthGroups.map((group) => ({
            key: group.monthStart,
            label: MONTH_FORMAT.format(group.monthStart),
            items: group.items,
          })),
    [grouping, weekGroups, monthGroups],
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

      <div className="flex gap-2" role="tablist" aria-label="Group history by">
        {GROUPING_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={grouping === option.value}
            onClick={() => setGrouping(option.value)}
            className={`min-h-11 flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              grouping === option.value
                ? "border-zinc-950 bg-zinc-950 text-zinc-50 dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                : "border-zinc-300 bg-white text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
          No workouts finished yet.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key.toISOString()} className="flex flex-col gap-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                {group.label}
              </h2>
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {group.items.map((session) => (
                  <li key={session.id}>
                    <Link
                      href={`/history/${session.id}`}
                      data-ripple
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
                        {Math.round(session.totalVolume).toLocaleString()} {settings.units}
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
