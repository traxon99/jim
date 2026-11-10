"use client";

import { type TrainingDay, buildCalendarMonth, dateKey } from "@jim/core";
import { Thermometer } from "lucide-react";
import { useMemo } from "react";

const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const WEEKDAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "short" });

/** Shading from lightest to darkest, by a day's share of your biggest day's volume. */
export const INTENSITY_LEVELS = [
  "bg-accent/25",
  "bg-accent/50",
  "bg-accent/75 text-accent-foreground",
  "bg-accent text-accent-foreground",
] as const;

export function intensityClass(volume: number, maxVolume: number): string {
  if (volume <= 0) return "";
  const ratio = maxVolume > 0 ? volume / maxVolume : 0;
  if (ratio > 0.75) return INTENSITY_LEVELS[3];
  if (ratio > 0.5) return INTENSITY_LEVELS[2];
  if (ratio > 0.25) return INTENSITY_LEVELS[1];
  return INTENSITY_LEVELS[0];
}

/** A sick day (issue #779): a dashed outline, so it never reads as a volume shade. */
export const SICK_DAY_CLASS = "border border-dashed border-zinc-500 dark:border-zinc-400";

/**
 * A day cell's fill: the volume shade and, on a sick day, the dashed outline
 * as well. A day can be sick and trained (issue #781), so neither hides the other.
 */
export function dayFillClass(shade: string, isSick: boolean): string {
  return [shade, isSick ? SICK_DAY_CLASS : ""].filter(Boolean).join(" ");
}

const LABEL_DATE_FORMAT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** Screen-reader name for a day cell, so trained and selected days aren't conveyed by color alone. */
export function dayAriaLabel(
  date: Date,
  sessionCount: number,
  isSelected: boolean,
  isSick = false,
): string {
  const parts = [LABEL_DATE_FORMAT.format(date)];
  if (sessionCount > 0) parts.push(`${sessionCount} workout${sessionCount === 1 ? "" : "s"}`);
  if (isSick) parts.push("sick day");
  if (isSelected) parts.push("selected");
  return parts.join(", ");
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
  /** Sick days (issue #779) as YYYY-MM-DD keys. */
  sickDays?: ReadonlySet<string>;
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
  sickDays,
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
              const isSick = sickDays?.has(key) ?? false;
              const shade = intensityClass(day?.totalVolume ?? 0, maxVolume);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectDate(date)}
                  aria-label={dayAriaLabel(date, day?.sessionCount ?? 0, isSelected, isSick)}
                  aria-pressed={isSelected}
                  title={`${
                    day
                      ? `${date.toLocaleDateString()} — ${day.sessionCount} session${day.sessionCount > 1 ? "s" : ""}`
                      : date.toLocaleDateString()
                  }${isSick ? " · sick day" : ""}`}
                  className={`relative flex aspect-square min-h-9 items-center justify-center rounded-lg text-sm ${
                    inMonth ? "" : "text-zinc-400 dark:text-zinc-600"
                  } ${dayFillClass(shade, isSick)} ${
                    isSelected
                      ? "ring-2 ring-accent"
                      : isToday
                        ? "ring-1 ring-zinc-400 dark:ring-zinc-500"
                        : ""
                  }`}
                >
                  {date.getDate()}
                  {isSick && (
                    <Thermometer
                      className="pointer-events-none absolute right-0.5 top-0.5 h-2.5 w-2.5"
                      strokeWidth={2.25}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* What the shading means (issue #328). */}
      <div className="flex items-center justify-end gap-1 text-[11px] text-zinc-500 dark:text-zinc-500">
        {sickDays && sickDays.size > 0 && (
          <span className="mr-2 flex items-center gap-1">
            <span aria-hidden="true" className={`h-3 w-3 rounded-sm ${SICK_DAY_CLASS}`} />
            Sick
          </span>
        )}
        <span className="mr-0.5">Less volume</span>
        {INTENSITY_LEVELS.map((level) => (
          <span key={level} aria-hidden="true" className={`h-3 w-3 rounded-sm ${level}`} />
        ))}
        <span className="ml-0.5">More</span>
      </div>
    </div>
  );
}
