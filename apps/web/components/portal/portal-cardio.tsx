"use client";

import { toTrendPoints } from "@/lib/portal/body-data";
import {
  type CardioWorkoutPoint,
  type PortalCardioData,
  cardioRecordRows,
  cardioWorkoutPoints,
  summarizeCardio,
} from "@/lib/portal/cardio-data";
import { analysisRangeStart, distanceUnitFor, formatDistance, formatDuration } from "@jim/core";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PortalSectionHeader, useAnalysisRange } from "./analysis-range";
import { PortalTrendChart } from "./trend-chart";
import { useIsClient } from "./use-is-client";

const HEADING = "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

const SELECT_CLASS =
  "min-h-11 min-w-0 max-w-full rounded-lg border border-zinc-200 bg-white px-3 text-base text-zinc-950 md:text-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50";

const ALL = "all";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <span className="text-xs text-zinc-500 dark:text-zinc-500">{label}</span>
      <span className="allow-pwa-select break-words text-2xl font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

/** A total like "13h 10m": clock form ("13:10:35") reads as a time of day. */
function formatTotalTime(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return formatDuration(seconds);
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function chartPoints(
  points: readonly CardioWorkoutPoint[],
  pick: (p: CardioWorkoutPoint) => number | null,
) {
  return toTrendPoints(
    points.flatMap((point) => {
      const value = pick(point);
      return value == null
        ? []
        : [{ id: point.sessionId, measuredAt: point.at.toISOString(), value }];
    }),
  );
}

/**
 * The Analysis Cardio section (issue #470): distance, time and pace per
 * workout over the chosen range, and each cardio exercise's records
 * (`computeCardioBests`). Cardio stays out of every strength and volume
 * number elsewhere in Analysis.
 */
export function PortalCardio({ data }: { data: PortalCardioData }) {
  const [range, setRange] = useAnalysisRange();
  const isClient = useIsClient();
  const [exerciseId, setExerciseId] = useState<string>(ALL);
  const unit = distanceUnitFor(data.units);

  const points = useMemo(() => {
    const since = analysisRangeStart(range, new Date());
    return cardioWorkoutPoints(
      data.sets.filter(
        (set) =>
          (exerciseId === ALL || set.exerciseId === exerciseId) &&
          (since == null || new Date(set.completedAt) >= since),
      ),
    );
  }, [data.sets, exerciseId, range]);
  const summary = summarizeCardio(points);
  const records = useMemo(() => cardioRecordRows(data), [data]);
  // Pace differs too much between activities to share a line.
  const showPace = exerciseId !== ALL || data.exercises.length === 1;

  return (
    <div className="route-fade flex flex-col gap-6">
      <PortalSectionHeader title="Cardio" range={range} onRangeChange={setRange} />

      {data.sets.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          No cardio logged yet. Add a cardio exercise such as running or rowing to a workout in Jim,
          and its distance and time show up here.
        </p>
      ) : (
        <>
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-500">
            Exercise
            <select
              value={exerciseId}
              onChange={(event) => setExerciseId(event.target.value)}
              className={SELECT_CLASS}
            >
              <option value={ALL}>All cardio</option>
              {data.exercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Workouts" value={summary.workouts.toLocaleString()} />
            <StatTile
              label="Distance"
              value={summary.distance > 0 ? formatDistance(summary.distance, unit) : "—"}
            />
            <StatTile
              label="Time"
              value={summary.durationSeconds > 0 ? formatTotalTime(summary.durationSeconds) : "—"}
            />
            <StatTile
              label="Average pace"
              value={
                showPace && summary.paceSeconds != null
                  ? `${formatDuration(summary.paceSeconds)} /${unit}`
                  : "—"
              }
            />
          </div>

          {isClient && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="flex min-w-0 flex-col gap-2">
                <h2 className={HEADING}>Distance per workout ({unit})</h2>
                <PortalTrendChart
                  points={chartPoints(points, (point) => point.distance)}
                  label="Distance"
                  unit={unit}
                  emptyText="No distances logged in this range."
                />
              </section>
              <section className="flex min-w-0 flex-col gap-2">
                <h2 className={HEADING}>Time per workout</h2>
                <PortalTrendChart
                  points={chartPoints(points, (point) => point.durationSeconds)}
                  label="Time"
                  unit=""
                  format={formatDuration}
                  emptyText="No times logged in this range."
                />
              </section>
              <section className="flex min-w-0 flex-col gap-2">
                <h2 className={HEADING}>Pace per workout (lower is faster)</h2>
                {showPace ? (
                  <PortalTrendChart
                    points={chartPoints(points, (point) => point.paceSeconds)}
                    label="Pace"
                    unit={`/${unit}`}
                    format={formatDuration}
                    emptyText="No workouts in this range logged both a distance and a time."
                  />
                ) : (
                  <p className="text-sm text-zinc-500 dark:text-zinc-500">
                    Pick one exercise to chart its pace.
                  </p>
                )}
              </section>
            </div>
          )}

          <section className="flex flex-col gap-2">
            <h2 className={HEADING}>Records · all time</h2>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-zinc-500 dark:text-zinc-500">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Exercise
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Longest distance
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Longest time
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Fastest pace
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Workouts
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Last done
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((row) => (
                    <tr
                      key={row.exerciseId}
                      className="border-t border-zinc-100 dark:border-zinc-900"
                    >
                      <th scope="row" className="max-w-56 px-3 py-2 font-medium">
                        <Link
                          href={`/portal/exercises/${row.exerciseId}`}
                          className="block truncate hover:underline"
                        >
                          {row.name}
                        </Link>
                      </th>
                      <td className="allow-pwa-select whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {row.bests.distance != null
                          ? formatDistance(row.bests.distance, unit)
                          : "—"}
                      </td>
                      <td className="allow-pwa-select whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {row.bests.durationSeconds != null
                          ? formatDuration(row.bests.durationSeconds)
                          : "—"}
                      </td>
                      <td className="allow-pwa-select whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {row.bests.paceSeconds != null
                          ? `${formatDuration(row.bests.paceSeconds)} /${unit}`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {row.workouts}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-500 dark:text-zinc-500">
                        {isClient ? row.lastDoneAt.toLocaleDateString() : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
