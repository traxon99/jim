"use client";

import { BODYWEIGHT_TREND_DAYS } from "@/components/bodyweight/bodyweight-chart";
import {
  type PortalBodyData,
  summarizeTrend,
  toTrendPoints,
  trendPointsSince,
} from "@/lib/portal/body-data";
import { analysisRangeStart } from "@jim/core";
import { useMemo, useState } from "react";
import { PortalSectionHeader, useAnalysisRange } from "./analysis-range";
import { PortalTrendChart } from "./trend-chart";
import { useIsClient } from "./use-is-client";

/** How many weigh-ins the table shows before "Show all". */
const TABLE_PREVIEW = 30;

function formatValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatChange(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "±0";
  return `${rounded > 0 ? "+" : "−"}${formatValue(Math.abs(rounded))}`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <span className="text-xs text-zinc-500 dark:text-zinc-500">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/**
 * The Analysis Body section (issue #470): the bodyweight trend for the
 * chosen range with its 7-day average, the change over that range, and
 * every weigh-in. Read-only: weigh-ins are logged on the phone.
 */
export function PortalBody({ data }: { data: PortalBodyData }) {
  const [range, setRange] = useAnalysisRange();
  const isClient = useIsClient();
  const [showAll, setShowAll] = useState(false);
  const all = useMemo(() => toTrendPoints(data.bodyweight), [data.bodyweight]);
  const visible = useMemo(
    () => trendPointsSince(all, analysisRangeStart(range, new Date())),
    [all, range],
  );
  const summary = summarizeTrend(visible);
  // Newest first, each with the change since the weigh-in before it.
  const table = useMemo(
    () =>
      all
        .map((point, index) => ({
          point,
          change: index > 0 ? point.value - (all[index - 1]?.value ?? point.value) : null,
        }))
        .reverse(),
    [all],
  );
  const units = data.units;

  return (
    <div className="route-fade flex flex-col gap-6">
      <PortalSectionHeader title="Body" range={range} onRangeChange={setRange} />

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          Bodyweight ({units})
        </h2>
        {all.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            No weigh-ins yet. In Jim, open Profile, then Bodyweight, to log one or import your
            history.
          </p>
        ) : (
          <>
            {summary && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatTile label="Latest" value={formatValue(summary.latest.value)} />
                <StatTile
                  label={
                    isClient
                      ? `Change since ${summary.first.measuredAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                      : "Change"
                  }
                  value={formatChange(summary.change)}
                />
                <StatTile label="Lowest" value={formatValue(summary.lowest)} />
                <StatTile label="Highest" value={formatValue(summary.highest)} />
              </div>
            )}
            {isClient && (
              <PortalTrendChart
                points={visible}
                label="Bodyweight"
                unit={units}
                trendDays={BODYWEIGHT_TREND_DAYS}
                emptyText="No weigh-ins in this range."
              />
            )}
          </>
        )}
      </section>

      {table.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Weigh-ins · {table.length.toLocaleString()}
          </h2>
          <table className="w-full text-sm md:max-w-xl">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 text-right font-medium">Weight ({units})</th>
                <th className="py-2 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="allow-pwa-select divide-y divide-zinc-200 dark:divide-zinc-800">
              {(showAll ? table : table.slice(0, TABLE_PREVIEW)).map(({ point, change }) => (
                <tr key={point.id}>
                  <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">
                    {isClient
                      ? point.measuredAt.toLocaleDateString(undefined, {
                          weekday: "short",
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
          {!showAll && table.length > TABLE_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="min-h-11 self-start text-sm font-medium underline underline-offset-4"
            >
              Show all {table.length.toLocaleString()}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
