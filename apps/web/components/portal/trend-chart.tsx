"use client";

import { ChartTooltip, formatTooltipDate } from "@/components/charts/chart-tooltip";
import { trailingAverage } from "@/lib/bodyweight/series";
import { clientXToViewBox, nearestIndexByX } from "@/lib/charts/chart-hover";
import type { TrendPoint } from "@/lib/portal/body-data";
import { type KeyboardEvent, type MouseEvent, useState } from "react";

const WIDTH = 640;
const HEIGHT = 200;
const PADDING = 12;

function formatValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/**
 * A body measurement over time on desktop (issue #470): the phone's
 * `TrendChart` drawn wider, with hover and arrow-key tooltips like the e1RM
 * chart (issue #468). With `trendDays` the line is that trailing average and
 * the dots are the raw entries; without it the line joins the entries.
 */
export function PortalTrendChart({
  points,
  label,
  unit,
  trendDays = null,
  emptyText,
}: {
  points: readonly TrendPoint[];
  label: string;
  unit: string;
  trendDays?: number | null;
  emptyText: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-500">{emptyText}</p>;
  }

  const trend = trendDays ? trailingAverage(points, trendDays) : points.map((p) => p.value);
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueSpan = maxValue - minValue || 1;
  const times = points.map((point) => point.measuredAt.getTime());
  const minTime = Math.min(...times);
  const timeSpan = Math.max(...times) - minTime || 1;

  function x(point: TrendPoint): number {
    if (points.length === 1) return WIDTH / 2;
    return PADDING + ((point.measuredAt.getTime() - minTime) / timeSpan) * (WIDTH - PADDING * 2);
  }

  function y(value: number): number {
    if (maxValue === minValue) return HEIGHT / 2;
    return HEIGHT - PADDING - ((value - minValue) / valueSpan) * (HEIGHT - PADDING * 2);
  }

  const xs = points.map(x);
  function indexAt(event: MouseEvent<HTMLDivElement>): number | null {
    const box = event.currentTarget.getBoundingClientRect();
    return nearestIndexByX(xs, clientXToViewBox(event.clientX, box, WIDTH));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const last = points.length - 1;
    const step = event.key === "ArrowLeft" ? -1 : 1;
    setActiveIndex((index) => Math.min(last, Math.max(0, (index ?? last + 1) + step)));
  }

  function describe(index: number): string {
    const point = points[index];
    if (!point) return "";
    const average = trendDays
      ? `, ${trendDays}-day average ${formatValue(trend[index] ?? point.value)}`
      : "";
    return `${formatTooltipDate(point.measuredAt)}: ${formatValue(point.value)} ${unit}${average}`;
  }

  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${x(point).toFixed(1)},${y(trend[index] ?? point.value).toFixed(1)}`,
    )
    .join(" ");
  const active = activeIndex == null ? undefined : points[activeIndex];
  const last = points.length - 1;

  return (
    <div className="flex flex-col gap-1 text-zinc-900 dark:text-zinc-50">
      <div
        className="relative touch-pan-y"
        role="slider"
        tabIndex={0}
        aria-label={`${label} over time, ranging from ${formatValue(minValue)} to ${formatValue(maxValue)} ${unit}`}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={activeIndex ?? last}
        aria-valuetext={describe(activeIndex ?? last)}
        onPointerMove={(event) => setActiveIndex(indexAt(event))}
        onPointerLeave={() => setActiveIndex(null)}
        onBlur={() => setActiveIndex(null)}
        onKeyDown={handleKeyDown}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block w-full" aria-hidden="true">
          {[maxValue, minValue].map((value, index) =>
            index === 1 && maxValue === minValue ? null : (
              <g key={value}>
                <line
                  x1={PADDING}
                  y1={y(value)}
                  x2={WIDTH - PADDING}
                  y2={y(value)}
                  stroke="currentColor"
                  strokeOpacity={0.15}
                  strokeDasharray="2 3"
                />
                <text
                  x={PADDING}
                  y={index === 0 ? y(value) + 11 : y(value) - 4}
                  fontSize={11}
                  fill="currentColor"
                  opacity={0.55}
                >
                  {formatValue(value)}
                </text>
              </g>
            ),
          )}
          {points.map((point) => (
            <circle
              key={point.id}
              cx={x(point)}
              cy={y(point.value)}
              r={trendDays ? 2.5 : 3.5}
              fill="currentColor"
              opacity={trendDays ? 0.35 : 1}
            />
          ))}
          {points.length > 1 && (
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {active && (
            <>
              <line
                x1={x(active)}
                y1={PADDING / 2}
                x2={x(active)}
                y2={HEIGHT - PADDING / 2}
                stroke="currentColor"
                strokeOpacity={0.25}
              />
              <circle
                cx={x(active)}
                cy={y(active.value)}
                r={5}
                fill="currentColor"
                className="stroke-white dark:stroke-zinc-950"
                strokeWidth={1.5}
              />
            </>
          )}
        </svg>
        {active && activeIndex != null && (
          <ChartTooltip xFraction={x(active) / WIDTH} yFraction={y(active.value) / HEIGHT}>
            <span className="font-semibold">{formatTooltipDate(active.measuredAt)}</span>
            <span className="tabular-nums">
              {formatValue(active.value)} {unit}
            </span>
            {trendDays && (
              <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                {trendDays}-day avg {formatValue(trend[activeIndex] ?? active.value)}
              </span>
            )}
          </ChartTooltip>
        )}
      </div>
      <div className="flex justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-500">
        <span>{points[0]?.measuredAt.toLocaleDateString()}</span>
        {points.length === 1 ? (
          <span>Log another to see a trend</span>
        ) : (
          trendDays && <span className="min-w-0 truncate">Line: {trendDays}-day average</span>
        )}
        {points.length > 1 && <span>{points[last]?.measuredAt.toLocaleDateString()}</span>}
      </div>
    </div>
  );
}
