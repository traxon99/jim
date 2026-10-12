"use client";

import { OneRepMaxChart } from "@/components/history/one-rep-max-chart";
import type { PortalTrainingData } from "@/lib/portal/analysis-data";
import { analysisRangeStart, strengthTrends } from "@jim/core";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import { PortalSectionHeader, useAnalysisRange } from "./analysis-range";
import { type HighlightedSet, PortalWorkoutCard } from "./portal-workout-card";
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

/**
 * The Analysis Exercises section (issues #38, #470): every lift's estimated
 * 1RM trend for the chosen range, with a chart for the selected one. The
 * numbers come from `packages/core`, so they match the phone's exercise
 * charts and PRs exactly.
 */
export function PortalStrength({ data }: { data: PortalTrainingData }) {
  const [range, setRange] = useAnalysisRange();
  const { sets, exerciseNames, workouts } = usePortalTraining(data);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  // The workout a tapped chart point opened (issue #468).
  const [openWorkout, setOpenWorkout] = useState<{
    sessionIds: string[];
    highlight: HighlightedSet;
  } | null>(null);

  const trends = useMemo(
    () => strengthTrends(sets, analysisRangeStart(range, new Date())),
    [sets, range],
  );
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
                      <th className="py-2 pr-3 text-right font-medium">Change</th>
                      <th className="py-2 pr-3 text-right font-medium">Best ever</th>
                      <th className="py-2 text-right font-medium">Sessions</th>
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
                  <OneRepMaxChart
                    points={selectedTrend.points}
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
