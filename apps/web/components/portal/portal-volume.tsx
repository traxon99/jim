"use client";

import { BodyMap } from "@/components/exercises/body-map";
import {
  GOALS,
  METRICS,
  type Metric,
  STATUS_TEXT,
  StatusSummary,
  WeekVolumeBars,
  formatRange,
  formatValue,
  readStoredGoal,
  rowsFor,
  valuesFor,
  writeStoredGoal,
} from "@/components/history/muscle-volume";
import {
  type PortalVolumeData,
  averagePerWeek,
  reviveVolumeSets,
  volumeWeeksInRange,
} from "@/lib/portal/volume-data";
import {
  type TrainingGoal,
  WEEKLY_SET_TARGETS,
  type WeeklyMuscleVolume,
  heatmapShading,
  startOfWeek,
  weeklySetStatus,
} from "@jim/core";
import { useEffect, useMemo, useState } from "react";
import { PortalSectionHeader, useAnalysisRange } from "./analysis-range";
import { useIsClient } from "./use-is-client";

const HEADING = "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="grid grid-cols-2 gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-9 rounded-md px-4 text-sm font-medium ${
            value === option.value
              ? "bg-white shadow-sm dark:bg-zinc-800"
              : "text-zinc-500 dark:text-zinc-500"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function weekLabel(week: WeeklyMuscleVolume): string {
  return week.weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The Analysis Volume section (issue #470): the phone's Volume by muscle
 * screen with room to spread out. One week's body map and bars, each
 * muscle's weekly average over the chosen range against the goal's target,
 * and a muscle-by-week grid. Counted exactly as the phone counts: working
 * sets only, secondary muscles at half (docs/VOLUME-TARGETS.md).
 */
export function PortalVolume({ data }: { data: PortalVolumeData }) {
  const [range, setRange] = useAnalysisRange();
  const isClient = useIsClient();
  const [metric, setMetric] = useState<Metric>("sets");
  // The same per-device goal the phone remembers.
  const [goal, setGoal] = useState<TrainingGoal>("hypertrophy");
  useEffect(() => setGoal(readStoredGoal()), []);
  const chooseGoal = (next: TrainingGoal) => {
    setGoal(next);
    writeStoredGoal(next);
  };
  const [selectedWeek, setSelectedWeek] = useState(0);

  const sets = useMemo(() => reviveVolumeSets(data.sets), [data.sets]);
  // Week boundaries are local time, so weeks are built only in the browser.
  const weeks = useMemo(
    () => (isClient ? volumeWeeksInRange(sets, data.weekStart, range, new Date()) : []),
    [isClient, sets, data.weekStart, range],
  );
  const trainedMuscles = useMemo(
    () => [...new Set(weeks.flatMap((week) => Object.keys(week.setsByMuscle)))],
    [weeks],
  );
  const average = useMemo(
    () => averagePerWeek(weeks, (week) => valuesFor(week, metric)),
    [weeks, metric],
  );
  const averageRows = useMemo(() => {
    const rows = { ...average };
    if (metric === "sets") for (const muscle of trainedMuscles) rows[muscle] ??= 0;
    return Object.entries(rows).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [average, metric, trainedMuscles]);

  const week = weeks[Math.min(selectedWeek, weeks.length - 1)];
  const weekIndex = week ? weeks.indexOf(week) : 0;
  const currentWeekStart = isClient ? startOfWeek(new Date(), data.weekStart).getTime() : 0;
  const isCurrent = week?.weekStart.getTime() === currentWeekStart;

  // One scale for every week shown, wide enough for the target band.
  const max = Math.max(
    metric === "sets" ? WEEKLY_SET_TARGETS[goal].max : 0,
    ...weeks.flatMap((w) => Object.values(valuesFor(w, metric))),
  );
  const averageMax = Math.max(
    metric === "sets" ? WEEKLY_SET_TARGETS[goal].max : 0,
    ...Object.values(average),
  );
  const weekEntries = week ? rowsFor(week, metric, trainedMuscles) : [];
  const weekValues = week ? valuesFor(week, metric) : {};
  const weekTrained = Object.keys(weekValues).filter((muscle) => (weekValues[muscle] ?? 0) > 0);

  return (
    <div className="route-fade flex flex-col gap-6">
      <PortalSectionHeader title="Volume" range={range} onRangeChange={setRange} />

      {data.sets.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          No working sets logged yet. Finish a workout in Jim and its volume shows up here.
        </p>
      ) : !isClient || !week ? null : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <SegmentedControl
                label="Measure"
                options={METRICS}
                value={metric}
                onChange={setMetric}
              />
              {metric === "sets" && (
                <SegmentedControl label="Goal" options={GOALS} value={goal} onChange={chooseGoal} />
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              {metric === "sets"
                ? `Working sets per muscle each week; warm-ups don't count and a muscle worked secondarily counts half a set. The shaded band is ${formatRange(WEEKLY_SET_TARGETS[goal])} sets, the evidence-based weekly range for ${goal}.`
                : `Weight × reps of working sets per muscle each week, in ${data.units}; secondary muscles count half.`}
            </p>
          </div>

          <section className="grid gap-6 rounded-lg border border-zinc-200 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] dark:border-zinc-800">
            <div className="flex min-w-0 flex-col gap-2">
              <h2 className={HEADING}>
                {isCurrent ? "This week at a glance" : `Week of ${weekLabel(week)} at a glance`}
              </h2>
              <BodyMap
                shading={heatmapShading(weekValues, max)}
                label={
                  weekTrained.length > 0
                    ? `Muscles trained: ${weekTrained.join(", ")}. Darker means more ${metric}.`
                    : "No muscles trained this week."
                }
              />
              <p className="text-center text-xs text-zinc-500 dark:text-zinc-500">
                Darker means more {metric === "sets" ? "sets" : "volume"}. Pick a week in the grid
                below to see it here.
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <h2 className={HEADING}>
                {isCurrent ? "This week · so far" : `Week of ${weekLabel(week)}`}
              </h2>
              {metric === "sets" && weekEntries.length > 0 && (
                <StatusSummary entries={weekEntries} goal={goal} />
              )}
              <WeekVolumeBars
                entries={weekEntries}
                metric={metric}
                max={max}
                units={data.units}
                goal={goal}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className={HEADING}>
              Average per week · last {weeks.length} {weeks.length === 1 ? "week" : "weeks"}
            </h2>
            {metric === "sets" && averageRows.length > 0 && (
              <StatusSummary entries={averageRows} goal={goal} />
            )}
            <WeekVolumeBars
              entries={averageRows}
              metric={metric}
              max={averageMax}
              units={data.units}
              goal={goal}
            />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className={HEADING}>Week by week</h2>
            <MuscleWeekGrid
              weeks={weeks}
              muscles={averageRows.map(([muscle]) => muscle)}
              metric={metric}
              goal={goal}
              max={max}
              units={data.units}
              selected={weekIndex}
              onSelect={setSelectedWeek}
              currentWeekStart={currentWeekStart}
            />
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Muscles down, weeks across (newest on the left). In sets mode each cell
 * takes its status color against the goal; in volume mode it's shaded by
 * how much was done. The grid scrolls inside its own box, never the page
 * (docs/PWA.md §3). Week headers are buttons that show that week above.
 */
function MuscleWeekGrid({
  weeks,
  muscles,
  metric,
  goal,
  max,
  units,
  selected,
  onSelect,
  currentWeekStart,
}: {
  weeks: readonly WeeklyMuscleVolume[];
  muscles: readonly string[];
  metric: Metric;
  goal: TrainingGoal;
  max: number;
  units: string;
  selected: number;
  onSelect: (index: number) => void;
  currentWeekStart: number;
}) {
  if (muscles.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-500">No sets in this range.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 bg-white px-3 py-2 text-left font-medium text-zinc-500 dark:bg-zinc-950"
            >
              Muscle
            </th>
            {weeks.map((week, index) => (
              <th key={week.weekStart.toISOString()} scope="col" className="p-1 font-medium">
                <button
                  type="button"
                  aria-pressed={index === selected}
                  onClick={() => onSelect(index)}
                  className={`min-h-9 w-full whitespace-nowrap rounded-md px-2 ${
                    index === selected
                      ? "bg-accent text-accent-foreground"
                      : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  }`}
                >
                  {week.weekStart.getTime() === currentWeekStart ? "This week" : weekLabel(week)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {muscles.map((muscle) => (
            <tr key={muscle} className="border-t border-zinc-100 dark:border-zinc-900">
              <th
                scope="row"
                className="sticky left-0 whitespace-nowrap bg-white px-3 py-1.5 text-left font-normal capitalize text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400"
              >
                {muscle}
              </th>
              {weeks.map((week, index) => {
                const value = valuesFor(week, metric)[muscle] ?? 0;
                const status = metric === "sets" ? weeklySetStatus(value, goal) : null;
                return (
                  <td
                    key={week.weekStart.toISOString()}
                    className={`allow-pwa-select px-2 py-1.5 text-center tabular-nums ${
                      index === selected ? "bg-zinc-50 dark:bg-zinc-900" : ""
                    } ${
                      status
                        ? STATUS_TEXT[status]
                        : value > 0
                          ? "text-zinc-950 dark:text-zinc-50"
                          : "text-zinc-400 dark:text-zinc-600"
                    }`}
                    style={
                      !status && value > 0 && max > 0
                        ? {
                            backgroundColor: `color-mix(in srgb, var(--color-accent) ${Math.round(
                              (value / max) * 40,
                            )}%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    {value > 0
                      ? metric === "sets"
                        ? formatValue(value, metric, units)
                        : Math.round(value).toLocaleString()
                      : "·"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
