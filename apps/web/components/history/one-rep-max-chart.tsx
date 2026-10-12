"use client";

import { ChartTooltip, formatTooltipDate } from "@/components/charts/chart-tooltip";
import { clientXToViewBox, formatSetLine, nearestIndexByX } from "@/lib/charts/chart-hover";
import type { OneRepMaxPoint } from "@jim/core";
import { type KeyboardEvent, type MouseEvent, useState } from "react";

const WIDTH = 320;
const HEIGHT = 120;
const PADDING = 10;

/**
 * "Per-exercise history with an estimated-1RM-over-time chart" (STORIES.md
 * S7). Points are time-proportional along x (not just evenly spaced by
 * index), so a gap in training shows up as a gap in the line. Colored with
 * `currentColor` off the wrapping text color, so it stays legible in both
 * themes without a second, dark-mode-specific palette to keep in sync.
 *
 * Hovering (or arrow keys while focused) shows the nearest point's date,
 * workout and the set behind it; tapping it calls `onSelectPoint`, which
 * opens that workout (issue #468).
 */
export function OneRepMaxChart({
  points,
  units,
  workoutTitle,
  onSelectPoint,
}: {
  points: OneRepMaxPoint[];
  units?: string;
  /** The workout's title for a point's tooltip, when the caller knows it. */
  workoutTitle?: (sessionId: string) => string | undefined;
  onSelectPoint?: (point: OneRepMaxPoint) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Not enough history yet to chart a trend.
      </p>
    );
  }

  const values = points.map((point) => point.estimatedOneRepMax);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueSpan = maxValue - minValue || 1;
  const current = points[points.length - 1]?.estimatedOneRepMax ?? 0;

  const times = points.map((point) => point.date.getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeSpan = maxTime - minTime || 1;

  function x(point: OneRepMaxPoint): number {
    if (points.length === 1) return WIDTH / 2;
    return PADDING + ((point.date.getTime() - minTime) / timeSpan) * (WIDTH - PADDING * 2);
  }

  function y(value: number): number {
    return HEIGHT - PADDING - ((value - minValue) / valueSpan) * (HEIGHT - PADDING * 2);
  }

  const xs = points.map(x);

  // Taps read the pointer position again rather than `activeIndex`: on touch
  // the pointerleave that clears it fires before the click.
  function indexAt(event: MouseEvent<HTMLDivElement>): number | null {
    const box = event.currentTarget.getBoundingClientRect();
    return nearestIndexByX(xs, clientXToViewBox(event.clientX, box, WIDTH));
  }

  function select(index: number | null) {
    const point = index == null ? undefined : points[index];
    if (point && onSelectPoint) onSelectPoint(point);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = points.length - 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const step = event.key === "ArrowLeft" ? -1 : 1;
      setActiveIndex((index) => Math.min(last, Math.max(0, (index ?? last + 1) + step)));
    } else if ((event.key === "Enter" || event.key === " ") && activeIndex != null) {
      event.preventDefault();
      select(activeIndex);
    }
  }

  const active = activeIndex == null ? undefined : points[activeIndex];
  const activeTitle = active ? workoutTitle?.(active.sessionId) : undefined;

  function describe(point: OneRepMaxPoint | undefined): string {
    if (!point) return "";
    const title = workoutTitle?.(point.sessionId);
    return [
      title,
      formatTooltipDate(point.date),
      `${formatSetLine(point.weight, point.reps, units)}, estimated 1RM ${Math.round(point.estimatedOneRepMax)}`,
    ]
      .filter(Boolean)
      .join(", ");
  }

  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${x(point).toFixed(1)},${y(point.estimatedOneRepMax).toFixed(1)}`,
    )
    .join(" ");

  return (
    <div className="text-zinc-900 dark:text-zinc-50">
      <div className="mb-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">
          {Math.round(current).toLocaleString()}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-500">Current estimated 1RM</span>
      </div>
      <div
        className={`relative touch-pan-y ${onSelectPoint ? "cursor-pointer" : ""}`}
        // A slider in ARIA terms: arrow keys step through the workouts and
        // the value text reads the one under focus (issue #468).
        role="slider"
        tabIndex={0}
        aria-label={`Estimated one-rep max over time, currently ${Math.round(current).toLocaleString()}, ranging from ${Math.round(minValue).toLocaleString()} to ${Math.round(maxValue).toLocaleString()}${onSelectPoint ? ". Press Enter to open a workout." : ""}`}
        aria-valuemin={0}
        aria-valuemax={points.length - 1}
        aria-valuenow={activeIndex ?? points.length - 1}
        aria-valuetext={describe(points[activeIndex ?? points.length - 1])}
        onPointerMove={(event) => setActiveIndex(indexAt(event))}
        onPointerLeave={() => setActiveIndex(null)}
        onBlur={() => setActiveIndex(null)}
        onKeyDown={handleKeyDown}
        onClick={(event) => select(indexAt(event))}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block w-full" aria-hidden="true">
          <line
            x1={PADDING}
            y1={y(maxValue)}
            x2={WIDTH - PADDING}
            y2={y(maxValue)}
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeDasharray="2 3"
          />
          <text x={PADDING} y={y(maxValue) + 9} fontSize={9} fill="currentColor" opacity={0.55}>
            {Math.round(maxValue).toLocaleString()}
          </text>
          {maxValue !== minValue && (
            <>
              <line
                x1={PADDING}
                y1={y(minValue)}
                x2={WIDTH - PADDING}
                y2={y(minValue)}
                stroke="currentColor"
                strokeOpacity={0.15}
                strokeDasharray="2 3"
              />
              <text x={PADDING} y={y(minValue) - 3} fontSize={9} fill="currentColor" opacity={0.55}>
                {Math.round(minValue).toLocaleString()}
              </text>
            </>
          )}
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((point) => (
            <circle
              key={point.sessionId}
              cx={x(point)}
              cy={y(point.estimatedOneRepMax)}
              r={2.5}
              fill="currentColor"
            />
          ))}
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
                cy={y(active.estimatedOneRepMax)}
                r={4.5}
                fill="currentColor"
                className="stroke-white dark:stroke-zinc-950"
                strokeWidth={1.5}
              />
            </>
          )}
        </svg>
        {active && (
          <ChartTooltip
            xFraction={x(active) / WIDTH}
            yFraction={y(active.estimatedOneRepMax) / HEIGHT}
          >
            {activeTitle && <span className="truncate font-semibold">{activeTitle}</span>}
            <span className="text-zinc-500 dark:text-zinc-400">
              {formatTooltipDate(active.date)}
            </span>
            <span className="tabular-nums">
              {formatSetLine(active.weight, active.reps, units)} · e1RM{" "}
              {Math.round(active.estimatedOneRepMax).toLocaleString()}
            </span>
          </ChartTooltip>
        )}
      </div>
      <div className="mt-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-500">
        <span>{points[0]?.date.toLocaleDateString()}</span>
        <span>Best: {Math.round(maxValue).toLocaleString()}</span>
        <span>{points[points.length - 1]?.date.toLocaleDateString()}</span>
      </div>
    </div>
  );
}
