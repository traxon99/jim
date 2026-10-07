"use client";

import { BodyMap } from "@/components/exercises/body-map";
import { LoadingText } from "@/components/loading-text";
import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db/schema";
import { buildMuscleVolumeSets } from "@/lib/history/muscle-volume-data";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import {
  type TrainingGoal,
  WEEKLY_SET_TARGETS,
  type WeeklyMuscleVolume,
  type WeeklySetRange,
  type WeeklySetStatus,
  heatmapShading,
  startOfWeek,
  weeklySetStatus,
  weeklyVolumeByMuscle,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";

const WEEKS_SHOWN = 6;

type Metric = "sets" | "volume";

const METRICS: { value: Metric; label: string }[] = [
  { value: "sets", label: "Sets" },
  { value: "volume", label: "Volume" },
];

const GOALS: { value: TrainingGoal; label: string }[] = [
  { value: "strength", label: "Strength" },
  { value: "hypertrophy", label: "Hypertrophy" },
];

/** The goal is a per-device view preference, so it lives in localStorage. */
const GOAL_STORAGE_KEY = "jim:volume-goal";

function readStoredGoal(): TrainingGoal {
  try {
    return window.localStorage.getItem(GOAL_STORAGE_KEY) === "strength"
      ? "strength"
      : "hypertrophy";
  } catch {
    return "hypertrophy";
  }
}

function writeStoredGoal(goal: TrainingGoal): void {
  try {
    window.localStorage.setItem(GOAL_STORAGE_KEY, goal);
  } catch {
    // Safari private mode etc. — the choice still holds for this page life.
  }
}

const STATUS_BAR: Record<WeeklySetStatus, string> = {
  under: "bg-amber-500 dark:bg-amber-400",
  within: "bg-emerald-500 dark:bg-emerald-400",
  over: "bg-sky-500 dark:bg-sky-400",
};

const STATUS_TEXT: Record<WeeklySetStatus, string> = {
  under: "text-amber-600 dark:text-amber-400",
  within: "text-emerald-600 dark:text-emerald-400",
  over: "text-sky-600 dark:text-sky-400",
};

const STATUS_LABEL: Record<WeeklySetStatus, string> = {
  under: "below range",
  within: "in range",
  over: "above range",
};

function valuesFor(week: WeeklyMuscleVolume, metric: Metric) {
  return metric === "sets" ? week.setsByMuscle : week.volumeByMuscle;
}

/**
 * A week's rows. In sets mode, a muscle trained in any week shown but not
 * this one still gets a 0 row, so a muscle that's been skipped shows up as
 * under its target instead of silently disappearing (issue #395).
 */
function rowsFor(
  week: WeeklyMuscleVolume,
  metric: Metric,
  trainedMuscles: readonly string[],
): [string, number][] {
  const values = { ...valuesFor(week, metric) };
  if (metric === "sets") {
    for (const muscle of trainedMuscles) values[muscle] ??= 0;
  }
  return Object.entries(values).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
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
  entries,
  metric,
  max,
  units,
  goal,
}: {
  entries: readonly [string, number][];
  metric: Metric;
  max: number;
  units: string;
  goal: TrainingGoal;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-500">No sets logged this week.</p>;
  }

  const range = metric === "sets" ? WEEKLY_SET_TARGETS[goal] : null;
  const percent = (value: number) => (max > 0 ? Math.min(100, (value / max) * 100) : 0);

  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map(([muscle, value]) => {
        const status = range ? weeklySetStatus(value, goal) : null;
        return (
          <li key={muscle} className="flex min-w-0 items-center gap-2">
            <span className="w-24 shrink-0 truncate text-xs capitalize text-zinc-600 dark:text-zinc-400">
              {muscle}
            </span>
            <div className="relative h-2 min-w-0 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
              {range && (
                // The goal's target range, drawn as a band on the track.
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 rounded-full bg-emerald-500/20 dark:bg-emerald-400/20"
                  style={{
                    left: `${percent(range.min)}%`,
                    width: `${percent(range.max) - percent(range.min)}%`,
                  }}
                />
              )}
              <div
                className={`relative h-2 rounded-full ${status ? STATUS_BAR[status] : "bg-accent"}`}
                style={{ width: `${percent(value)}%` }}
              />
            </div>
            <span
              className={`w-16 shrink-0 text-right text-xs tabular-nums ${
                status ? STATUS_TEXT[status] : "text-zinc-500 dark:text-zinc-500"
              }`}
            >
              {formatValue(value, metric, units)}
              {status && <span className="sr-only">, {STATUS_LABEL[status]}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "4 in range · 3 below · 1 above", counting only statuses that occur. */
function StatusSummary({
  entries,
  goal,
}: {
  entries: readonly [string, number][];
  goal: TrainingGoal;
}) {
  const counts: Record<WeeklySetStatus, number> = { under: 0, within: 0, over: 0 };
  for (const [, value] of entries) counts[weeklySetStatus(value, goal)] += 1;
  const parts = (
    [
      ["within", "in range"],
      ["under", "below"],
      ["over", "above"],
    ] as const
  ).filter(([status]) => counts[status] > 0);

  return (
    <p className="flex flex-wrap gap-x-2 text-xs">
      {parts.map(([status, label], index) => (
        <span key={status} className={STATUS_TEXT[status]}>
          {index > 0 && <span className="text-zinc-400 dark:text-zinc-600">· </span>}
          {counts[status]} {label}
        </span>
      ))}
    </p>
  );
}

function formatRange(range: WeeklySetRange): string {
  return `${range.min}–${range.max}`;
}

/**
 * The most recent week as a body-map heatmap (issue #252), on the same scale
 * as the bars below, so the darkest muscles are the ones trained most.
 */
function LatestWeekMap({
  week,
  metric,
  max,
  current,
}: {
  week: WeeklyMuscleVolume | undefined;
  metric: Metric;
  max: number;
  current: number;
}) {
  if (!week) return null;
  const values = valuesFor(week, metric);
  const trained = Object.keys(values).filter((muscle) => (values[muscle] ?? 0) > 0);
  const isCurrent = week.weekStart.getTime() === current;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        {isCurrent
          ? "This week at a glance"
          : `Week of ${week.weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at a glance`}
      </h2>
      <BodyMap
        shading={heatmapShading(values, max)}
        label={
          trained.length > 0
            ? `Muscles trained: ${trained.join(", ")}. Darker means more ${metric}.`
            : "No muscles trained yet."
        }
      />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-500">
        Darker means more {metric === "sets" ? "sets" : "volume"}.
      </p>
    </section>
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
  // Read after mount so the server render and first client render match.
  const [goal, setGoal] = useState<TrainingGoal>("hypertrophy");
  useEffect(() => setGoal(readStoredGoal()), []);
  const chooseGoal = (next: TrainingGoal) => {
    setGoal(next);
    writeStoredGoal(next);
  };
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

  const trainedMuscles = useMemo(
    () => [...new Set(weeks.flatMap((week) => Object.keys(week.setsByMuscle)))],
    [weeks],
  );
  // In sets mode the scale also fits the whole target band.
  const max = Math.max(
    metric === "sets" ? WEEKLY_SET_TARGETS[goal].max : 0,
    ...weeks.flatMap((week) => Object.values(valuesFor(week, metric))),
  );
  const currentWeekStart = startOfWeek(new Date(), settings.weekStart).getTime();

  const loading =
    rawSessions === undefined ||
    rawSessionExercises === undefined ||
    exercises === undefined ||
    rawSets === undefined;

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <LoadingText />
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
              {metric === "sets" && (
                <div
                  role="tablist"
                  aria-label="Goal"
                  className="grid grid-cols-2 gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {GOALS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="tab"
                      aria-selected={goal === option.value}
                      onClick={() => chooseGoal(option.value)}
                      className={`min-h-9 rounded-md text-sm font-medium ${
                        goal === option.value
                          ? "bg-white shadow-sm dark:bg-zinc-800"
                          : "text-zinc-500 dark:text-zinc-500"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                {metric === "sets"
                  ? `Working sets per muscle each week; warm-ups don't count and a muscle worked secondarily counts half a set. The shaded band is ${formatRange(WEEKLY_SET_TARGETS[goal])} sets, the evidence-based weekly range for ${goal}.`
                  : `Weight × reps of working sets per muscle each week, in ${settings.units}; secondary muscles count half.`}{" "}
                Bars share one scale across weeks.
              </p>
            </div>
            <LatestWeekMap week={weeks[0]} metric={metric} max={max} current={currentWeekStart} />
            {weeks.map((week) => {
              const current = week.weekStart.getTime() === currentWeekStart;
              const entries = rowsFor(week, metric, trainedMuscles);
              return (
                <section key={week.weekStart.toISOString()} className="flex flex-col gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                    {current
                      ? "This week · so far"
                      : `Week of ${week.weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                  </h2>
                  {metric === "sets" && entries.length > 0 && (
                    <StatusSummary entries={entries} goal={goal} />
                  )}
                  <WeekVolumeBars
                    entries={entries}
                    metric={metric}
                    max={max}
                    units={settings.units}
                    goal={goal}
                  />
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
