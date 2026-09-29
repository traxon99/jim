import { dateKey, startOfWeek } from "@jim/core";

/** The ranges Home's stat cards compare, in days. */
export const STAT_RANGES = [7, 30, 90] as const;
export type StatRange = (typeof STAT_RANGES)[number];

/** What Home's stats need from a finished workout. */
export interface StatSession {
  startedAt: Date;
  endedAt: Date | null;
  totalVolume: number;
  prCount: number;
}

export interface PeriodTotals {
  activeDays: number;
  workouts: number;
  minutes: number;
  volume: number;
  prs: number;
}

function addDays(date: Date, days: number): Date {
  // By calendar date rather than 24h steps, so a DST change can't drift it.
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function totals(sessions: readonly StatSession[], from: Date, to: Date): PeriodTotals {
  const days = new Set<string>();
  const result: PeriodTotals = { activeDays: 0, workouts: 0, minutes: 0, volume: 0, prs: 0 };
  for (const session of sessions) {
    if (session.startedAt < from || session.startedAt >= to) continue;
    days.add(dateKey(session.startedAt));
    result.workouts += 1;
    if (session.endedAt) {
      result.minutes += Math.max(
        0,
        (session.endedAt.getTime() - session.startedAt.getTime()) / 60_000,
      );
    }
    result.volume += session.totalVolume;
    result.prs += session.prCount;
  }
  result.activeDays = days.size;
  result.minutes = Math.round(result.minutes);
  return result;
}

/**
 * Totals for the last `range` calendar days (today included) alongside the
 * `range` days before that, so each stat card can show which way it moved.
 */
export function periodStats(
  sessions: readonly StatSession[],
  range: StatRange,
  now: Date,
): { current: PeriodTotals; previous: PeriodTotals } {
  const end = addDays(now, 1);
  const start = addDays(end, -range);
  const previousStart = addDays(start, -range);
  return {
    current: totals(sessions, start, end),
    previous: totals(sessions, previousStart, start),
  };
}

export interface WeekDay {
  date: Date;
  trained: boolean;
  isToday: boolean;
  isFuture: boolean;
}

/** The seven days of the current week (per `weekStart`) and which ones had a workout. */
export function weekActivity(
  workoutDates: readonly Date[],
  weekStart: number,
  now: Date,
): WeekDay[] {
  const trainedKeys = new Set(workoutDates.map(dateKey));
  const todayKey = dateKey(now);
  const first = startOfWeek(now, weekStart);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(first, index);
    const key = dateKey(date);
    return {
      date,
      trained: trainedKeys.has(key),
      isToday: key === todayKey,
      isFuture: key > todayKey,
    };
  });
}

/** "1h 5m" or "16m": how Home shows time spent training. */
export function formatMinutes(minutes: number): string {
  const rounded = Math.round(Math.abs(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "12.3k" past ten thousand, so a volume total fits on a stat card. */
export function formatCompact(value: number): string {
  const rounded = Math.round(Math.abs(value));
  if (rounded < 10_000) return rounded.toLocaleString();
  if (rounded < 1_000_000) return `${Number((rounded / 1000).toFixed(1))}k`;
  return `${Number((rounded / 1_000_000).toFixed(1))}M`;
}
