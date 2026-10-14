"use client";

import { TrendChart } from "@/components/charts/trend-chart";
import { TRACKED_MEASUREMENT_KINDS, type TrackedMeasurementKind } from "@/lib/bodyweight/series";
import {
  MEASUREMENT_RANGES,
  type MeasurementRangeKey,
  type PortalBodyData,
  measurementPointsInRange,
  summarizeTrend,
  toTrendPoints,
} from "@/lib/portal/body-data";
import { MEASUREMENT_LABELS, displayUnitFor, measurementUnitLabel } from "@jim/core";
import { useMemo, useState } from "react";
import { useIsClient } from "./use-is-client";

function formatValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatChange(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "±0";
  return `${rounded > 0 ? "+" : "−"}${formatValue(Math.abs(rounded))}`;
}

/** "32.5 in", but "18%" with no space for body fat. */
function withUnit(value: number, unitLabel: string): string {
  return unitLabel === "%" ? `${formatValue(value)}%` : `${formatValue(value)} ${unitLabel}`;
}

/**
 * Body measurements on desktop (issue #470): pick waist, chest, arms, body
 * fat, neck, hips, thighs or calves to see its trend over 3M / 1Y / All
 * (counted back from the latest entry, as on the phone) and every entry.
 */
export function PortalMeasurements({ data }: { data: PortalBodyData }) {
  const isClient = useIsClient();
  const [kind, setKind] = useState<TrackedMeasurementKind>(
    () => TRACKED_MEASUREMENT_KINDS.find((k) => data.measurements[k].length > 0) ?? "waist",
  );
  const [range, setRange] = useState<MeasurementRangeKey>("all");

  const series = useMemo(() => toTrendPoints(data.measurements[kind]), [data.measurements, kind]);
  const visible = useMemo(() => measurementPointsInRange(series, range), [series, range]);
  const summary = summarizeTrend(visible);
  const unitLabel = measurementUnitLabel(displayUnitFor(kind, data.units));
  const label = MEASUREMENT_LABELS[kind];
  const entries = useMemo(
    () =>
      series
        .map((point, index) => ({
          point,
          change: index > 0 ? point.value - (series[index - 1]?.value ?? point.value) : null,
        }))
        .reverse(),
    [series],
  );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Measurements
      </h2>
      <fieldset className="grid grid-cols-4 gap-2 lg:grid-cols-8">
        <legend className="sr-only">Measurement</legend>
        {TRACKED_MEASUREMENT_KINDS.map((option) => {
          const points = data.measurements[option];
          const latest = points[points.length - 1];
          const optionUnit = measurementUnitLabel(displayUnitFor(option, data.units));
          return (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              onClick={() => setKind(option)}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-xs font-medium ${
                kind === option
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-zinc-200 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
              }`}
            >
              <span className="w-full truncate text-center">{MEASUREMENT_LABELS[option]}</span>
              <span className="w-full truncate text-center tabular-nums opacity-70">
                {latest ? withUnit(latest.value, optionUnit) : "–"}
              </span>
            </button>
          );
        })}
      </fieldset>

      {series.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          No {label.toLowerCase()} measurements yet. In Jim, open Profile, then Measurements, to log
          one.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {summary && (
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-2xl font-semibold tabular-nums">
                    {withUnit(summary.latest.value, unitLabel)}
                  </span>
                  {isClient && summary.first !== summary.latest && (
                    <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                      {formatChange(summary.change)}
                      {unitLabel === "%" ? " pts" : ` ${unitLabel}`} since{" "}
                      {summary.first.measuredAt.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
              )}
              <fieldset className="flex gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
                <legend className="sr-only">Chart range</legend>
                {MEASUREMENT_RANGES.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={range === option.key}
                    onClick={() => setRange(option.key)}
                    className={`min-h-9 rounded-md px-3 text-sm font-medium ${
                      range === option.key
                        ? "bg-accent text-accent-foreground"
                        : "text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </fieldset>
            </div>
            {isClient && (
              <TrendChart
                points={visible}
                label={label}
                unit={unitLabel}
                emptyText={`No ${label.toLowerCase()} measurements in this range.`}
              />
            )}
          </div>
          <table className="w-full self-start text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 text-right font-medium">
                  {label} ({unitLabel})
                </th>
                <th className="py-2 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="allow-pwa-select divide-y divide-zinc-200 dark:divide-zinc-800">
              {entries.map(({ point, change }) => (
                <tr key={point.id}>
                  <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">
                    {isClient
                      ? point.measuredAt.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : ""}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums">
                    {formatValue(point.value)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-zinc-500 dark:text-zinc-500">
                    {change == null ? "—" : formatChange(change)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
