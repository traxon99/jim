"use client";

import { Highlight } from "@/components/highlight";
import { OneRepMaxChart } from "@/components/history/one-rep-max-chart";
import type { PortalTrainingData } from "@/lib/portal/analysis-data";
import { type PortalExerciseIndexRow, exerciseMatchesSearch } from "@/lib/portal/exercises-data";
import { analysisRangeStart, strengthTrends } from "@jim/core";
import { ArrowDownRight, ArrowUpRight, ChartLine, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PortalSectionHeader, useAnalysisRange } from "./analysis-range";
import { type HighlightedSet, PortalWorkoutCard } from "./portal-workout-card";
import { useIsClient } from "./use-is-client";
import { NO_WORKOUTS_YET, usePortalTraining } from "./use-portal-training";

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

const CATEGORY_LABELS = { strength: null, warmup: "Warm-up", cardio: "Cardio" } as const;

/**
 * Every exercise ever logged, warm-ups and cardio included (issue #470),
 * searchable by name, each opening its exercise page.
 */
function ExerciseIndex({ rows }: { rows: readonly PortalExerciseIndexRow[] }) {
  const isClient = useIsClient();
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () => rows.filter((row) => exerciseMatchesSearch(row, query)),
    [rows, query],
  );
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          Every exercise · {rows.length.toLocaleString()}
        </h2>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 px-3 md:max-w-xs md:flex-none dark:border-zinc-800">
          <Search
            className="h-4 w-4 shrink-0 text-zinc-400"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="sr-only">Search exercises</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search exercises"
            className="min-h-11 w-full min-w-0 bg-transparent text-base outline-none"
          />
        </label>
      </div>
      {matches.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">No exercises match.</p>
      ) : (
        <ul className="grid gap-x-6 divide-y divide-zinc-200 text-sm md:grid-cols-2 md:divide-y-0 dark:divide-zinc-800">
          {matches.map((row) => {
            const tag = CATEGORY_LABELS[row.category];
            return (
              <li key={row.id} className="md:border-b md:border-zinc-200 md:dark:border-zinc-800">
                <Link
                  href={`/portal/exercises/${row.id}`}
                  className="flex min-w-0 items-center gap-3 py-2"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate font-medium">
                      <Highlight text={row.name} query={query} />
                    </span>
                    {tag && (
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {tag}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
                    {row.workouts.toLocaleString()} workout{row.workouts === 1 ? "" : "s"}
                    {isClient &&
                      ` · ${new Date(row.lastDoneAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}`}
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-zinc-400"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * The Analysis Exercises section (issues #38, #470): every lift's estimated
 * 1RM trend for the chosen range, with a chart for the selected one. The
 * numbers come from `packages/core`, so they match the phone's exercise
 * charts and PRs exactly.
 */
export function PortalStrength({
  data,
}: { data: PortalTrainingData & { exerciseIndex: PortalExerciseIndexRow[] } }) {
  const [range, setRange] = useAnalysisRange();
  const { sets, exerciseNames, workouts } = usePortalTraining(data);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  // The workout a tapped chart point opened (issue #468).
  const [openWorkout, setOpenWorkout] = useState<{
    sessionIds: string[];
    highlight: HighlightedSet;
  } | null>(null);

  const trends = useMemo(() => {
    const now = new Date();
    return strengthTrends(sets, analysisRangeStart(range, now), {}, now);
  }, [sets, range]);
  const selectedTrend =
    trends.find((trend) => trend.exerciseId === selectedExerciseId) ?? trends[0];

  return (
    <div className="route-fade flex flex-col gap-6">
      <PortalSectionHeader title="Exercises" range={range} onRangeChange={setRange} />
      {data.sets.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-500">
          {NO_WORKOUTS_YET}
        </p>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Strength · estimated 1RM ({data.units})
          </h2>
          {trends.length === 0 ? (
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
                      <th className="py-2 pr-3 text-right font-medium">Predicted</th>
                      <th className="py-2 pr-3 text-right font-medium">Change</th>
                      <th className="py-2 pr-3 text-right font-medium">Best ever</th>
                      <th className="py-2 pr-1 text-right font-medium">Sessions</th>
                      <th className="w-10 py-2">
                        <span className="sr-only">Chart</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {trends.map((trend) => {
                      const selected = trend.exerciseId === selectedTrend?.exerciseId;
                      return (
                        <tr
                          key={trend.exerciseId}
                          className={selected ? "bg-zinc-100 dark:bg-zinc-900" : undefined}
                        >
                          <td className="py-2 pr-3">
                            <Link
                              href={`/portal/exercises/${trend.exerciseId}`}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {exerciseNames.get(trend.exerciseId) ?? "Unknown exercise"}
                            </Link>
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {Math.round(trend.current).toLocaleString()}
                          </td>
                          <td className="py-2 pr-3 text-right font-medium tabular-nums">
                            {trend.predicted
                              ? Math.round(trend.predicted.value).toLocaleString()
                              : "—"}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            <ChangeCell change={trend.change} percent={trend.changePercent} />
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {Math.round(trend.allTimeBest).toLocaleString()}
                          </td>
                          <td className="py-2 pr-1 text-right tabular-nums">{trend.sessions}</td>
                          <td className="py-1 text-right">
                            <button
                              type="button"
                              aria-pressed={selected}
                              aria-label={`Chart ${exerciseNames.get(trend.exerciseId) ?? "this exercise"}`}
                              onClick={() => setSelectedExerciseId(trend.exerciseId)}
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-md ${
                                selected
                                  ? "text-zinc-900 dark:text-zinc-100"
                                  : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-300"
                              }`}
                            >
                              <ChartLine
                                className="h-4 w-4"
                                strokeWidth={1.75}
                                aria-hidden="true"
                              />
                            </button>
                          </td>
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
                  <OneRepMaxChart
                    points={selectedTrend.points}
                    predicted={selectedTrend.predictedPoints}
                    prediction={selectedTrend.predicted}
                    units={data.units}
                    workoutTitle={(sessionId) => workouts.get(sessionId)?.title}
                    onSelectPoint={(point) =>
                      setOpenWorkout({
                        sessionIds: [point.sessionId],
                        highlight: {
                          exerciseId: selectedTrend.exerciseId,
                          weight: point.weight,
                          reps: point.reps,
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>
          )}
        </section>
      )}
      <ExerciseIndex rows={data.exerciseIndex} />
      {openWorkout && (
        <PortalWorkoutCard
          {...openWorkout}
          sets={sets}
          exerciseNames={exerciseNames}
          workouts={workouts}
          units={data.units}
          onClose={() => setOpenWorkout(null)}
        />
      )}
    </div>
  );
}
