"use client";

import { OneRepMaxChart } from "@/components/history/one-rep-max-chart";
import { type PortalData, countGymVisits } from "@/lib/portal/analysis-data";
import {
  ANALYSIS_RANGES,
  type AnalysisRange,
  type AnalysisSet,
  DEFAULT_ANALYSIS_RANGE,
  type WeeklyVolumeTotal,
  analysisRangeStart,
  strengthTrends,
  summarizeTraining,
  weeklyVolumeTotals,
} from "@jim/core";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { GymMap } from "./gym-map";

const CHART_WIDTH = 640;
const CHART_HEIGHT = 160;
const CHART_PADDING = 4;

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <span className="text-xs text-zinc-500 dark:text-zinc-500">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Total volume per week as bars, with empty weeks left as visible gaps.
 * Uses the accent color like the phone's volume-by-muscle bars.
 */
function WeeklyVolumeChart({ weeks, units }: { weeks: WeeklyVolumeTotal[]; units: string }) {
  if (weeks.every((week) => week.volume === 0)) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-500">No weighted sets in this range.</p>
    );
  }

  const max = Math.max(...weeks.map((week) => week.volume));
  const slot = (CHART_WIDTH - CHART_PADDING * 2) / weeks.length;
  const barWidth = Math.max(1, slot * 0.7);
  const average = weeks.reduce((sum, week) => sum + week.volume, 0) / weeks.length;

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Weekly volume over ${weeks.length} weeks, peaking at ${Math.round(max).toLocaleString()} ${units}`}
      >
        {weeks.map((week, index) => {
          const height = max > 0 ? (week.volume / max) * (CHART_HEIGHT - CHART_PADDING * 2) : 0;
          return (
            <rect
              key={week.weekStart.toISOString()}
              x={CHART_PADDING + index * slot + (slot - barWidth) / 2}
              y={CHART_HEIGHT - CHART_PADDING - height}
              width={barWidth}
              height={height}
              rx={Math.min(3, barWidth / 2)}
              className="fill-accent"
            >
              <title>
                {`Week of ${week.weekStart.toLocaleDateString()}: ${Math.round(week.volume).toLocaleString()} ${units} · ${week.sets} sets · ${week.workouts} workouts`}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-500">
        <span>{weeks[0]?.weekStart.toLocaleDateString()}</span>
        <span>
          Avg {Math.round(average).toLocaleString()} {units}/week · Peak{" "}
          {Math.round(max).toLocaleString()}
        </span>
        <span>{weeks[weeks.length - 1]?.weekStart.toLocaleDateString()}</span>
      </div>
    </div>
  );
}

function ChangeCell({ change, percent }: { change: number; percent: number | null }) {
  const rounded = Math.round(change);
  if (rounded === 0) {
    return <span className="text-zinc-500 dark:text-zinc-500">—</span>;
  }
  const up = rounded > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${
        up ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"
      }`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      {up ? "+" : ""}
      {rounded.toLocaleString()}
      {percent != null && (
        <span className="text-xs opacity-80">
          {" "}
          ({up ? "+" : ""}
          {percent.toFixed(1)}%)
        </span>
      )}
    </span>
  );
}

/**
 * The web portal (issue #38): a desktop-width, read-only look at strength
 * trends and training load. All the numbers come from `packages/core`, so
 * they match the phone's exercise charts and PRs exactly. The gym map
 * (issue #462) shows where those workouts happened.
 */
export function PortalDashboard({ data }: { data: PortalData }) {
  const [range, setRange] = useState<AnalysisRange>(DEFAULT_ANALYSIS_RANGE);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);

  const sets = useMemo<AnalysisSet[]>(
    () => data.sets.map((set) => ({ ...set, completedAt: new Date(set.completedAt) })),
    [data.sets],
  );
  const exerciseNames = useMemo(
    () => new Map(data.exercises.map((exercise) => [exercise.id, exercise.name])),
    [data.exercises],
  );

  const analysis = useMemo(() => {
    const now = new Date();
    const since = analysisRangeStart(range, now);
    return {
      summary: summarizeTraining(sets, since, now),
      trends: strengthTrends(sets, since),
      weeks: weeklyVolumeTotals(sets, data.weekStart, since, now),
      gymVisits: countGymVisits(data.gymVisits, since),
    };
  }, [sets, range, data.weekStart, data.gymVisits]);

  const gymsByVisits = useMemo(
    () =>
      [...data.gyms].sort(
        (a, b) =>
          (analysis.gymVisits.get(b.id) ?? 0) - (analysis.gymVisits.get(a.id) ?? 0) ||
          Number(b.isHome) - Number(a.isHome) ||
          a.name.localeCompare(b.name),
      ),
    [data.gyms, analysis.gymVisits],
  );

  const selectedTrend =
    analysis.trends.find((trend) => trend.exerciseId === selectedExerciseId) ?? analysis.trends[0];

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Link
              href="/"
              className="flex items-center gap-1 text-sm font-medium text-zinc-500 dark:text-zinc-500"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Jim
            </Link>
            <h1 className="text-2xl font-semibold">Training analysis</h1>
            {data.email && <p className="text-sm text-zinc-500 dark:text-zinc-500">{data.email}</p>}
          </div>
          <fieldset className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
            <legend className="sr-only">Time range</legend>
            {ANALYSIS_RANGES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={range === option.id}
                onClick={() => setRange(option.id)}
                className={`min-h-9 rounded-md px-3 text-sm font-medium ${
                  range === option.id
                    ? "bg-accent text-accent-foreground"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {option.label}
              </button>
            ))}
          </fieldset>
        </header>

        {data.sets.length === 0 ? (
          <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No workouts logged yet. Train with Jim on your phone and your numbers will show up here.
          </p>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Workouts" value={analysis.summary.workouts.toLocaleString()} />
              <StatTile
                label="Workouts / week"
                value={analysis.summary.workoutsPerWeek.toFixed(1)}
              />
              <StatTile label="Working sets" value={analysis.summary.sets.toLocaleString()} />
              <StatTile
                label={`Volume (${data.units})`}
                value={Math.round(analysis.summary.volume).toLocaleString()}
              />
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                Weekly volume
              </h2>
              <WeeklyVolumeChart weeks={analysis.weeks} units={data.units} />
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                Strength · estimated 1RM ({data.units})
              </h2>
              {analysis.trends.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-500">
                  No weighted sets in this range.
                </p>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
                          <th className="py-2 pr-3 font-medium">Exercise</th>
                          <th className="py-2 pr-3 text-right font-medium">Current</th>
                          <th className="py-2 pr-3 text-right font-medium">Change</th>
                          <th className="py-2 pr-3 text-right font-medium">Best ever</th>
                          <th className="py-2 text-right font-medium">Sessions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {analysis.trends.map((trend) => {
                          const selected = trend.exerciseId === selectedTrend?.exerciseId;
                          return (
                            <tr
                              key={trend.exerciseId}
                              className={selected ? "bg-zinc-100 dark:bg-zinc-900" : undefined}
                            >
                              <td className="py-2 pr-3">
                                <button
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => setSelectedExerciseId(trend.exerciseId)}
                                  className="text-left font-medium underline-offset-4 hover:underline"
                                >
                                  {exerciseNames.get(trend.exerciseId) ?? "Unknown exercise"}
                                </button>
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">
                                {Math.round(trend.current).toLocaleString()}
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">
                                <ChangeCell change={trend.change} percent={trend.changePercent} />
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">
                                {Math.round(trend.allTimeBest).toLocaleString()}
                              </td>
                              <td className="py-2 text-right tabular-nums">{trend.sessions}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {selectedTrend && (
                    <div className="flex flex-col gap-2 lg:sticky lg:top-6 lg:self-start">
                      <h3 className="text-base font-semibold">
                        {exerciseNames.get(selectedTrend.exerciseId) ?? "Unknown exercise"}
                      </h3>
                      <OneRepMaxChart points={selectedTrend.points} />
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Gyms
          </h2>
          {data.gyms.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              No gyms on the map yet. In Jim, open Settings, then Gyms, and pick a matching place
              for each gym&apos;s address.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
              <GymMap gyms={data.gyms} visits={analysis.gymVisits} />
              <ul className="flex min-w-0 flex-col divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                {gymsByVisits.map((gym) => {
                  const count = analysis.gymVisits.get(gym.id) ?? 0;
                  return (
                    <li
                      key={gym.id}
                      className="flex min-w-0 items-start justify-between gap-3 py-2"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="flex min-w-0 items-center gap-1 font-medium">
                          <span className="truncate">{gym.name}</span>
                          {gym.isHome && (
                            <Star
                              className="h-3.5 w-3.5 shrink-0 text-accent"
                              strokeWidth={1.75}
                              fill="currentColor"
                              aria-label="Home gym"
                            />
                          )}
                        </span>
                        {gym.address && (
                          <span className="allow-pwa-select text-xs text-zinc-500 dark:text-zinc-500">
                            {gym.address}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">
                        {count.toLocaleString()} workout{count === 1 ? "" : "s"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
