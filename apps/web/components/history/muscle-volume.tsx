"use client";

import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db/schema";
import { buildMuscleVolumeSets } from "@/lib/history/muscle-volume-data";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { type WeeklyMuscleVolume, startOfWeek, weeklyVolumeByMuscle } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";

const WEEKS_SHOWN = 6;

type Metric = "sets" | "volume";

const METRICS: { value: Metric; label: string }[] = [
  { value: "sets", label: "Sets" },
  { value: "volume", label: "Volume" },
];

function valuesFor(week: WeeklyMuscleVolume, metric: Metric) {
  return metric === "sets" ? week.setsByMuscle : week.volumeByMuscle;
}

/** Half sets come from secondary muscles; show "4.5", not "4.50". */
function formatValue(value: number, metric: Metric, units: string): string {
  if (metric === "sets") return String(Math.round(value * 2) / 2);
  return `${Math.round(value).toLocaleString()} ${units}`;
}

/**
 * One week's bars, scaled to `max` — the largest value across every week
 * shown (issue #332) — so a muscle's bar can be compared week to week
 * instead of each week's leader always filling the row.
 */
function WeekVolumeBars({
  week,
  metric,
  max,
  units,
}: {
  week: WeeklyMuscleVolume;
  metric: Metric;
  max: number;
  units: string;
}) {
  const entries = Object.entries(valuesFor(week, metric)).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-500">No sets logged this week.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map(([muscle, volume]) => (
        <li key={muscle} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-xs capitalize text-zinc-600 dark:text-zinc-400">
            {muscle}
          </span>
          <div className="h-2 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-2 rounded-full bg-accent"
              style={{ width: `${max > 0 ? (volume / max) * 100 : 0}%` }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
            {formatValue(volume, metric, units)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Weekly volume by muscle group" (STORIES.md S7). Secondary muscles count
 * at half weight — see `weeklyVolumeByMuscle`'s doc comment in
 * packages/core/src/history/volume-by-muscle.ts for why.
 */
export function MuscleVolume() {
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  // Sets per muscle is what lifters program by, so it's the default.
  const [metric, setMetric] = useState<Metric>("sets");
  const rawSessions = useLiveQuery(() => db.sessions.toArray(), []);
  const rawSessionExercises = useLiveQuery(() => db.sessionExercises.toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const rawSets = useLiveQuery(() => db.sets.toArray(), []);

  const weeks = useMemo(() => {
    const sets = buildMuscleVolumeSets(
      rawSessions ?? [],
      rawSessionExercises ?? [],
      exercises ?? [],
      rawSets ?? [],
    );
    return weeklyVolumeByMuscle(sets, settings.weekStart).slice(0, WEEKS_SHOWN);
  }, [rawSessions, rawSessionExercises, exercises, rawSets, settings.weekStart]);

  const max = Math.max(0, ...weeks.flatMap((week) => Object.values(valuesFor(week, metric))));
  const currentWeekStart = startOfWeek(new Date(), settings.weekStart).getTime();

  const loading =
    rawSessions === undefined ||
    rawSessionExercises === undefined ||
    exercises === undefined ||
    rawSets === undefined;

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="Volume by muscle" back={{ href: "/history", label: "History" }} />
      <div className={PAGE_BODY}>
        {weeks.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No workouts finished yet.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <div
                role="tablist"
                aria-label="Measure"
                className="grid grid-cols-2 gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900"
              >
                {METRICS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={metric === option.value}
                    onClick={() => setMetric(option.value)}
                    className={`min-h-9 rounded-md text-sm font-medium ${
                      metric === option.value
                        ? "bg-white shadow-sm dark:bg-zinc-800"
                        : "text-zinc-500 dark:text-zinc-500"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                {metric === "sets"
                  ? "Sets per muscle each week; a muscle worked secondarily counts half a set."
                  : `Weight × reps per muscle each week, in ${settings.units}; secondary muscles count half.`}{" "}
                Bars share one scale across weeks.
              </p>
            </div>
            {weeks.map((week) => {
              const current = week.weekStart.getTime() === currentWeekStart;
              return (
                <section key={week.weekStart.toISOString()} className="flex flex-col gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                    {current
                      ? "This week · so far"
                      : `Week of ${week.weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                  </h2>
                  <WeekVolumeBars week={week} metric={metric} max={max} units={settings.units} />
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
