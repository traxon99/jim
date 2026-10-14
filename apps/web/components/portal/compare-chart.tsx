"use client";

import { ChartTooltip, formatTooltipDate } from "@/components/charts/chart-tooltip";
import { clientXToViewBox, formatSetLine, nearestIndexByX } from "@/lib/charts/chart-hover";
import type { CompareSeries } from "@/lib/portal/compare-data";
import type { OneRepMaxPoint } from "@jim/core";
import { type KeyboardEvent, type MouseEvent, useState } from "react";

const WIDTH = 720;
const HEIGHT = 260;
const PADDING = 12;
/** Room on the left for the axis labels, so they never sit under a line. */
const LEFT = 44;

/**
 * One color per compared lift, in order. Each reads on white and on
 * zinc-950; the legend and tooltip repeat the lift's name, so the chart never
 * relies on color alone.
 */
const COMPARE_COLORS = [
  "text-sky-600 dark:text-sky-400",
  "text-orange-600 dark:text-orange-400",
  "text-emerald-600 dark:text-emerald-400",
  "text-violet-600 dark:text-violet-400",
  "text-rose-600 dark:text-rose-400",
] as const;

/** Dash patterns, so lifts stay apart for anyone who can't tell the colors apart. */
const DASHES = [undefined, "6 4", "2 3", "10 3 2 3", "1 5"] as const;

interface FlatPoint {
  seriesIndex: number;
  point: OneRepMaxPoint;
}

function round(value: number): string {
  return Math.round(value).toLocaleString();
}

/**
 * Two or more lifts' estimated 1RM on one shared axis (issue #470). Hover or
 * arrow keys step through every session across the lifts; a tap opens that
 * workout, as the Exercises chart does (issue #468).
 */
export function CompareChart({
  series,
  names,
  units,
  onSelectPoint,
}: {
  series: readonly CompareSeries[];
  names: ReadonlyMap<string, string>;
  units: string;
  onSelectPoint?: (exerciseId: string, point: OneRepMaxPoint) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const flat: FlatPoint[] = series
    .flatMap((entry, seriesIndex) => entry.points.map((point) => ({ seriesIndex, point })))
    .sort((a, b) => a.point.date.getTime() - b.point.date.getTime());

  if (flat.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-500">
        None of these lifts were trained in this range.
      </p>
    );
  }

  const values = flat.map(({ point }) => point.estimatedOneRepMax);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const times = flat.map(({ point }) => point.date.getTime());
  const minTime = times[0] ?? 0;
  const timeSpan = (times.at(-1) ?? 0) - minTime;

  function x(point: OneRepMaxPoint): number {
    if (timeSpan === 0) return (LEFT + WIDTH - PADDING) / 2;
    return LEFT + ((point.date.getTime() - minTime) / timeSpan) * (WIDTH - LEFT - PADDING);
  }

  function y(value: number): number {
    if (maxValue === minValue) return HEIGHT / 2;
    return HEIGHT - PADDING - ((value - minValue) / (maxValue - minValue)) * (HEIGHT - PADDING * 2);
  }

  const xs = flat.map(({ point }) => x(point));
  function indexAt(event: MouseEvent<HTMLDivElement>): number | null {
    const box = event.currentTarget.getBoundingClientRect();
    return nearestIndexByX(xs, clientXToViewBox(event.clientX, box, WIDTH));
  }

  const last = flat.length - 1;
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && activeIndex != null) {
      const active = flat[activeIndex];
      if (active) onSelectPoint?.(series[active.seriesIndex]?.exerciseId ?? "", active.point);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -1 : 1;
    setActiveIndex((index) => Math.min(last, Math.max(0, (index ?? last + 1) + step)));
  }

  function nameOf(seriesIndex: number): string {
    return names.get(series[seriesIndex]?.exerciseId ?? "") ?? "Unknown exercise";
  }

  function describe(index: number): string {
    const entry = flat[index];
    if (!entry) return "";
    return `${nameOf(entry.seriesIndex)}, ${formatTooltipDate(entry.point.date)}: ${round(
      entry.point.estimatedOneRepMax,
    )} ${units} estimated 1RM`;
  }

  const active = activeIndex == null ? undefined : flat[activeIndex];
  const gridValues =
    maxValue === minValue ? [maxValue] : [maxValue, (maxValue + minValue) / 2, minValue];

  return (
    <div className="flex flex-col gap-1 text-zinc-900 dark:text-zinc-50">
      <div
        className={`relative touch-pan-y ${onSelectPoint ? "cursor-pointer" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label={`Estimated 1RM of ${series.map((_, index) => nameOf(index)).join(", ")} over time`}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={activeIndex ?? last}
        aria-valuetext={describe(activeIndex ?? last)}
        onPointerMove={(event) => setActiveIndex(indexAt(event))}
        onPointerLeave={() => setActiveIndex(null)}
        onBlur={() => setActiveIndex(null)}
        onKeyDown={handleKeyDown}
        onClick={(event) => {
          const index = indexAt(event);
          const entry = index == null ? undefined : flat[index];
          if (entry) onSelectPoint?.(series[entry.seriesIndex]?.exerciseId ?? "", entry.point);
        }}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block w-full" aria-hidden="true">
          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={LEFT}
                y1={y(value)}
                x2={WIDTH - PADDING}
                y2={y(value)}
                stroke="currentColor"
                strokeOpacity={0.15}
                strokeDasharray="2 3"
              />
              <text
                x={LEFT - 8}
                y={y(value) + 4}
                textAnchor="end"
                fontSize={11}
                fill="currentColor"
                opacity={0.55}
              >
                {round(value)}
              </text>
            </g>
          ))}
          {series.map((entry, seriesIndex) => (
            <g key={entry.exerciseId} className={COMPARE_COLORS[seriesIndex]}>
              {entry.points.length > 1 && (
                <path
                  d={entry.points
                    .map(
                      (point, index) =>
                        `${index === 0 ? "M" : "L"}${x(point).toFixed(1)},${y(point.estimatedOneRepMax).toFixed(1)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeDasharray={DASHES[seriesIndex]}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {entry.points.map((point) => (
                <circle
                  key={point.sessionId}
                  cx={x(point)}
                  cy={y(point.estimatedOneRepMax)}
                  r={3}
                  fill="currentColor"
                />
              ))}
            </g>
          ))}
          {active && (
            <g className={COMPARE_COLORS[active.seriesIndex]}>
              <line
                x1={x(active.point)}
                y1={PADDING / 2}
                x2={x(active.point)}
                y2={HEIGHT - PADDING / 2}
                stroke="currentColor"
                strokeOpacity={0.3}
              />
              <circle
                cx={x(active.point)}
                cy={y(active.point.estimatedOneRepMax)}
                r={5}
                fill="currentColor"
                className="stroke-white dark:stroke-zinc-950"
                strokeWidth={1.5}
              />
            </g>
          )}
        </svg>
        {active && (
          <ChartTooltip
            xFraction={x(active.point) / WIDTH}
            yFraction={y(active.point.estimatedOneRepMax) / HEIGHT}
          >
            <span className="font-semibold">{nameOf(active.seriesIndex)}</span>
            <span>{formatTooltipDate(active.point.date)}</span>
            <span className="tabular-nums">
              {round(active.point.estimatedOneRepMax)} {units} e1RM
            </span>
            <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
              {formatSetLine(active.point.weight, active.point.reps, units)}
            </span>
          </ChartTooltip>
        )}
      </div>
      <div className="flex justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-500">
        <span>{flat[0]?.point.date.toLocaleDateString()}</span>
        {last > 0 && <span>{flat[last]?.point.date.toLocaleDateString()}</span>}
      </div>
    </div>
  );
}

/** The swatch beside a lift's name: its color and dash, as drawn on the chart. */
export function CompareSwatch({ index }: { index: number }) {
  return (
    <svg
      viewBox="0 0 24 8"
      className={`h-2 w-6 shrink-0 ${COMPARE_COLORS[index] ?? ""}`}
      aria-hidden="true"
    >
      <line
        x1={1}
        y1={4}
        x2={23}
        y2={4}
        stroke="currentColor"
        strokeWidth={2.5}
        strokeDasharray={DASHES[index]}
        strokeLinecap="round"
      />
    </svg>
  );
}
