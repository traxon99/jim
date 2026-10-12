"use client";

import type { PortalTrainingData } from "@/lib/portal/analysis-data";
import {
  MAX_COMPARE_LIFTS,
  compareLifts,
  compareSeries,
  compareWindow,
  formatDateParam,
  parseLiftsParam,
} from "@/lib/portal/compare-data";
import { DEFAULT_ANALYSIS_RANGE } from "@jim/core";
import { ArrowDownRight, ArrowUpRight, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PortalSectionHeader, useAnalysisRange } from "./analysis-range";
import { CompareChart, CompareSwatch } from "./compare-chart";
import { type HighlightedSet, PortalWorkoutCard } from "./portal-workout-card";
import { useIsClient } from "./use-is-client";
import { NO_WORKOUTS_YET, usePortalTraining } from "./use-portal-training";

const HEADING = "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500";
const FIELD =
  "min-h-11 min-w-0 rounded-lg border border-zinc-200 bg-transparent px-3 text-base dark:border-zinc-800";

function Change({ change, percent }: { change: number | null; percent: number | null }) {
  const rounded = change == null ? 0 : Math.round(change);
  if (rounded === 0) return <span className="text-zinc-500 dark:text-zinc-500">—</span>;
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
 * The Analysis Compare section (issue #470): two or more lifts' estimated
 * 1RM on one chart, over the range picker's window or custom dates. The
 * lifts and dates live in the URL (`?lifts=`, `?from=`, `?to=`), so a
 * comparison survives a reload and can be bookmarked.
 */
export function PortalCompare({ data }: { data: PortalTrainingData }) {
  const isClient = useIsClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [range] = useAnalysisRange();
  const { sets, exerciseNames, workouts } = usePortalTraining(data);
  const [openWorkout, setOpenWorkout] = useState<{
    sessionIds: string[];
    highlight: HighlightedSet;
  } | null>(null);

  const lifts = useMemo(() => compareLifts(sets), [sets]);
  const available = useMemo(() => lifts.map((lift) => lift.exerciseId), [lifts]);
  const liftsParam = searchParams.get("lifts");
  const chosen = useMemo(() => parseLiftsParam(liftsParam, available), [liftsParam, available]);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  // The window is local days in the browser's time zone, so it waits for the client.
  const span = useMemo(
    () => (isClient ? compareWindow(range, from, to, new Date()) : null),
    [isClient, range, from, to],
  );
  const series = useMemo(
    () => (span ? compareSeries(lifts, chosen, span) : []),
    [lifts, chosen, span],
  );

  function update(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function setLifts(ids: string[]) {
    update({ lifts: ids.length > 0 ? ids.join(",") : "none" });
  }

  const unchosen = lifts.filter((lift) => !chosen.includes(lift.exerciseId));
  const nameOf = (id: string) => exerciseNames.get(id) ?? "Unknown exercise";

  return (
    <div className="route-fade flex flex-col gap-6">
      <PortalSectionHeader
        title="Compare lifts"
        range={range}
        customRange={span?.custom ?? false}
        onRangeChange={(next) => {
          // Picking a preset drops custom dates, so the picker means what it shows.
          update({
            from: null,
            to: null,
            range: next === DEFAULT_ANALYSIS_RANGE ? null : next,
          });
        }}
      />

      {lifts.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-500">
          {data.sets.length === 0 ? NO_WORKOUTS_YET : "No weighted sets logged yet."}
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className={HEADING}>
              Lifts · {chosen.length} of {MAX_COMPARE_LIFTS}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {chosen.map((id, index) => (
                <span
                  key={id}
                  className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-lg border border-zinc-200 pl-3 text-sm dark:border-zinc-800"
                >
                  <CompareSwatch index={index} />
                  <span className="min-w-0 truncate font-medium">{nameOf(id)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${nameOf(id)}`}
                    onClick={() => setLifts(chosen.filter((other) => other !== id))}
                    className="inline-flex h-11 w-10 shrink-0 items-center justify-center text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </span>
              ))}
              {chosen.length < MAX_COMPARE_LIFTS && unchosen.length > 0 && (
                <label className="flex min-w-0 max-w-full">
                  <span className="sr-only">Add a lift</span>
                  <select
                    value=""
                    onChange={(event) => {
                      if (event.target.value) setLifts([...chosen, event.target.value]);
                    }}
                    className={`${FIELD} w-full max-w-64 text-zinc-600 dark:text-zinc-400`}
                  >
                    <option value="">Add a lift…</option>
                    {unchosen.map((lift) => (
                      <option key={lift.exerciseId} value={lift.exerciseId}>
                        {nameOf(lift.exerciseId)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </section>

          <fieldset className="flex flex-wrap items-end gap-3">
            <legend className={`${HEADING} mb-2`}>Custom dates</legend>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-zinc-500 sm:flex-none dark:text-zinc-500">
              From
              <input
                type="date"
                value={from ?? ""}
                max={to ?? (isClient ? formatDateParam(new Date()) : undefined)}
                onChange={(event) => update({ from: event.target.value || null })}
                className={`${FIELD} text-zinc-900 dark:text-zinc-100`}
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-zinc-500 sm:flex-none dark:text-zinc-500">
              To
              <input
                type="date"
                value={to ?? ""}
                min={from ?? undefined}
                onChange={(event) => update({ to: event.target.value || null })}
                className={`${FIELD} text-zinc-900 dark:text-zinc-100`}
              />
            </label>
            {(from || to) && (
              <button
                type="button"
                onClick={() => update({ from: null, to: null })}
                className="min-h-11 rounded-lg px-3 text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
              >
                Clear dates
              </button>
            )}
          </fieldset>

          {chosen.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              Add a lift to start comparing.
            </p>
          ) : (
            span && (
              <section className="flex flex-col gap-4">
                <div className="flex min-w-0 flex-col gap-2">
                  <h2 className={HEADING}>Estimated 1RM ({data.units})</h2>
                  <CompareChart
                    series={series}
                    names={exerciseNames}
                    units={data.units}
                    onSelectPoint={(exerciseId, point) =>
                      setOpenWorkout({
                        sessionIds: [point.sessionId],
                        highlight: { exerciseId, weight: point.weight, reps: point.reps },
                      })
                    }
                  />
                </div>
                <div className="min-w-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
                        <th className="py-2 pr-3 font-medium">Lift</th>
                        <th className="py-2 pr-3 text-right font-medium">Latest</th>
                        <th className="py-2 pr-3 text-right font-medium">Change</th>
                        <th className="py-2 pr-3 text-right font-medium">Best</th>
                        <th className="py-2 pr-1 text-right font-medium">Sessions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {series.map((entry, index) => {
                        const latest = entry.points.at(-1)?.estimatedOneRepMax;
                        return (
                          <tr key={entry.exerciseId}>
                            <td className="py-2 pr-3">
                              <span className="flex min-w-0 items-center gap-2">
                                <CompareSwatch index={index} />
                                <span className="truncate font-medium">
                                  {nameOf(entry.exerciseId)}
                                </span>
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {latest == null ? "—" : Math.round(latest).toLocaleString()}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              <Change change={entry.change} percent={entry.changePercent} />
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {entry.best == null ? "—" : Math.round(entry.best).toLocaleString()}
                            </td>
                            <td className="py-2 pr-1 text-right tabular-nums">
                              {entry.points.length}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          )}
        </>
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
