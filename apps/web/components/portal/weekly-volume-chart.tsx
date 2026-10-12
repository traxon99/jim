"use client";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { clientXToViewBox } from "@/lib/charts/chart-hover";
import type { WeeklyVolumeTotal } from "@jim/core";
import { type KeyboardEvent, type MouseEvent, useState } from "react";

const CHART_WIDTH = 640;
const CHART_HEIGHT = 160;
const CHART_PADDING = 4;

/**
 * Total volume per week as bars, with empty weeks left as visible gaps.
 * Uses the accent color like the phone's volume-by-muscle bars. Hovering a
 * week shows its totals; tapping it lists that week's workouts (issue #468).
 */
export function WeeklyVolumeChart({
  weeks,
  units,
  onSelectWeek,
}: {
  weeks: WeeklyVolumeTotal[];
  units: string;
  onSelectWeek: (week: WeeklyVolumeTotal) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (weeks.every((week) => week.volume === 0)) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-500">No weighted sets in this range.</p>
    );
  }

  const max = Math.max(...weeks.map((week) => week.volume));
  const slot = (CHART_WIDTH - CHART_PADDING * 2) / weeks.length;
  const barWidth = Math.max(1, slot * 0.7);
  const average = weeks.reduce((sum, week) => sum + week.volume, 0) / weeks.length;
  const barHeight = (week: WeeklyVolumeTotal) =>
    max > 0 ? (week.volume / max) * (CHART_HEIGHT - CHART_PADDING * 2) : 0;

  // Read from the pointer each time rather than `activeIndex`: on touch the
  // pointerleave that clears it fires before the click.
  function indexAt(event: MouseEvent<HTMLDivElement>): number {
    const box = event.currentTarget.getBoundingClientRect();
    const x = clientXToViewBox(event.clientX, box, CHART_WIDTH);
    return Math.min(weeks.length - 1, Math.max(0, Math.floor((x - CHART_PADDING) / slot)));
  }

  const active = activeIndex == null ? undefined : weeks[activeIndex];
  const focusIndex = activeIndex ?? weeks.length - 1;

  function open(week: WeeklyVolumeTotal | undefined) {
    if (week && week.sessionIds.length > 0) onSelectWeek(week);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = weeks.length - 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const step = event.key === "ArrowLeft" ? -1 : 1;
      setActiveIndex((index) => Math.min(last, Math.max(0, (index ?? last + 1) + step)));
    } else if ((event.key === "Enter" || event.key === " ") && activeIndex != null) {
      event.preventDefault();
      open(weeks[activeIndex]);
    }
  }

  function describe(week: WeeklyVolumeTotal | undefined): string {
    if (!week) return "";
    return `Week of ${week.weekStart.toLocaleDateString()}: ${Math.round(week.volume).toLocaleString()} ${units}, ${week.sets} sets, ${week.workouts} workouts`;
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className="relative cursor-pointer touch-pan-y"
        // A slider in ARIA terms, like OneRepMaxChart: arrow keys step
        // through weeks, Enter lists the week's workouts (issue #468).
        role="slider"
        tabIndex={0}
        aria-label={`Weekly volume over ${weeks.length} weeks, peaking at ${Math.round(max).toLocaleString()} ${units}. Press Enter to list a week's workouts.`}
        aria-valuemin={0}
        aria-valuemax={weeks.length - 1}
        aria-valuenow={focusIndex}
        aria-valuetext={describe(weeks[focusIndex])}
        onKeyDown={handleKeyDown}
        onBlur={() => setActiveIndex(null)}
        onPointerMove={(event) => setActiveIndex(indexAt(event))}
        onPointerLeave={() => setActiveIndex(null)}
        onClick={(event) => open(weeks[indexAt(event)])}
      >
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="block w-full"
          aria-hidden="true"
        >
          {weeks.map((week, index) => {
            const height = barHeight(week);
            return (
              <rect
                key={week.weekStart.toISOString()}
                x={CHART_PADDING + index * slot + (slot - barWidth) / 2}
                y={CHART_HEIGHT - CHART_PADDING - height}
                width={barWidth}
                height={height}
                rx={Math.min(3, barWidth / 2)}
                className="fill-accent"
                opacity={active && index !== activeIndex ? 0.55 : 1}
              />
            );
          })}
        </svg>
        {active && activeIndex != null && (
          <ChartTooltip
            xFraction={(CHART_PADDING + (activeIndex + 0.5) * slot) / CHART_WIDTH}
            yFraction={(CHART_HEIGHT - CHART_PADDING - barHeight(active)) / CHART_HEIGHT}
          >
            <span className="font-semibold">
              Week of{" "}
              {active.weekStart.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span className="tabular-nums">
              {Math.round(active.volume).toLocaleString()} {units}
            </span>
            <span className="text-zinc-500 dark:text-zinc-400">
              {active.sets} set{active.sets === 1 ? "" : "s"} · {active.workouts} workout
              {active.workouts === 1 ? "" : "s"}
            </span>
          </ChartTooltip>
        )}
      </div>
      <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-500">
        <span>{weeks[0]?.weekStart.toLocaleDateString()}</span>
        <span>
          Avg {Math.round(average).toLocaleString()} {units}/week · Peak{" "}
          {Math.round(max).toLocaleString()}
        </span>
        <span>{weeks[weeks.length - 1]?.weekStart.toLocaleDateString()}</span>
      </div>
    </div>
  );
}
