"use client";

import { type TrainingDay, buildCalendarMonth, dateKey } from "@jim/core";
import { useMemo } from "react";

const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const WEEKDAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "short" });

/** Shading from lightest to darkest, by a day's share of your biggest day's volume. */
const INTENSITY_LEVELS = [
  "bg-accent/25",
  "bg-accent/50",
  "bg-accent/75 text-accent-foreground",
  "bg-accent text-accent-foreground",
] as const;

function intensityClass(volume: number, maxVolume: number): string {
  if (volume <= 0) return "";
  const ratio = maxVolume > 0 ? volume / maxVolume : 0;
  if (ratio > 0.75) return INTENSITY_LEVELS[3];
  if (ratio > 0.5) return INTENSITY_LEVELS[2];
  if (ratio > 0.25) return INTENSITY_LEVELS[1];
  return INTENSITY_LEVELS[0];
}

interface Props {
  month: Date;
  weekStart: number;
  days: Map<string, TrainingDay>;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  today?: Date;
}

/**
 * A real calendar month view of training days — replaces the GitHub-style
 * contribution heatmap (issue #60) with something a user can page through
 * month by month and tap a day on to see what happened that day.
 */
export function TrainingCalendarMonth({
  month,
  weekStart,
  days,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  today = new Date(),
}: Props) {
  const weeks = useMemo(() => buildCalendarMonth(month, weekStart), [month, weekStart]);
  const maxVolume = Math.max(0, ...[...days.values()].map((day) => day.totalVolume));
  const todayKey = dateKey(today);
  const selectedKey = selectedDate ? dateKey(selectedDate) : null;

  const weekdayLabels = useMemo(() => {
    const reference = new Date(2024, 0, 7 + weekStart); // a Sunday, offset to weekStart
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(reference);
      date.setDate(reference.getDate() + i);
      return WEEKDAY_FORMAT.format(date);
    });
  }, [weekStart]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onPrevMonth}
          aria-label="Previous month"
          className="min-h-11 min-w-11 rounded-lg text-lg font-medium text-zinc-600 dark:text-zinc-400"
        >
          ‹
        </button>
        <span className="text-sm font-semibold">{MONTH_FORMAT.format(month)}</span>
        <button
          type="button"
          onClick={onNextMonth}
          aria-label="Next month"
          className="min-h-11 min-w-11 rounded-lg text-lg font-medium text-zinc-600 dark:text-zinc-400"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-500">
        {weekdayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {weeks.map((week) => (
          <div key={week[0]?.date.toISOString()} className="grid grid-cols-7 gap-1">
            {week.map(({ date, inMonth }) => {
              const key = dateKey(date);
              const day = days.get(key);
              const isToday = key === todayKey;
              const isSelected = key === selectedKey;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectDate(date)}
                  title={
                    day
                      ? `${date.toLocaleDateString()} — ${day.sessionCount} session${day.sessionCount > 1 ? "s" : ""}`
                      : date.toLocaleDateString()
                  }
                  className={`aspect-square min-h-9 rounded-lg text-sm ${
                    inMonth ? "" : "text-zinc-400 dark:text-zinc-600"
                  } ${intensityClass(day?.totalVolume ?? 0, maxVolume)} ${
                    isSelected
                      ? "ring-2 ring-accent"
                      : isToday
                        ? "ring-1 ring-zinc-400 dark:ring-zinc-500"
                        : ""
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* What the shading means (issue #328). */}
      <div className="flex items-center justify-end gap-1 text-[11px] text-zinc-500 dark:text-zinc-500">
        <span className="mr-0.5">Less volume</span>
        {INTENSITY_LEVELS.map((level) => (
          <span key={level} aria-hidden="true" className={`h-3 w-3 rounded-sm ${level}`} />
        ))}
        <span className="ml-0.5">More</span>
      </div>
    </div>
  );
}
