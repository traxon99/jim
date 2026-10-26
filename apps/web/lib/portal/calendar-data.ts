import {
  type Achievement,
  type InjuryLike,
  type PainCheckinLike,
  injuryAreaLabel,
  painCalendar,
  startOfWeek,
} from "@jim/core";
import type { PortalWorkoutRow } from "./workouts-data";

/** An achievement as it crosses to the browser: the date as an ISO string. */
export type PortalAchievement = Omit<Achievement, "achievedAt"> & { achievedAt: string | null };

/** What the desktop Calendar section (issue #470) shows. */
export interface PortalCalendarData {
  units: "lb" | "kg";
  weekStart: number;
  /** Workouts a week that keep the streak alive, from the active program. */
  weeklyTarget: number;
  workouts: PortalWorkoutRow[];
  achievements: PortalAchievement[];
  /**
   * Pain by day for the "Show injuries" overlay (issue #627): each day's
   * worst pain and every injury checked in, keyed YYYY-MM-DD. Days without
   * a check-in are absent.
   */
  painDays: Record<string, { pain: number; injuries: string[] }>;
}

/** Each check-in day's worst pain and the injuries behind it, e.g. "Left knee 4". */
export function buildPainDays(
  injuries: readonly InjuryLike[],
  checkins: readonly PainCheckinLike[],
): PortalCalendarData["painDays"] {
  const live = injuries.filter((injury) => !injury.deletedAt);
  const labels = new Map(
    live.map((injury) => [injury.id, injuryAreaLabel(injury.area, injury.side)]),
  );
  const result: PortalCalendarData["painDays"] = {};
  for (const [day, entry] of painCalendar([...labels.keys()], checkins)) {
    result[day] = {
      pain: entry.pain,
      injuries: entry.entries.map((item) => `${labels.get(item.injuryId)} ${item.painLevel}`),
    };
  }
  return result;
}

export function serializeAchievements(achievements: readonly Achievement[]): PortalAchievement[] {
  return achievements.map((achievement) => ({
    ...achievement,
    achievedAt: achievement.achievedAt?.toISOString() ?? null,
  }));
}

export function reviveAchievements(achievements: readonly PortalAchievement[]): Achievement[] {
  return achievements.map((achievement) => ({
    ...achievement,
    achievedAt: achievement.achievedAt ? new Date(achievement.achievedAt) : null,
  }));
}

/**
 * The heatmap's period: the last 12 months, or one calendar year. "12m"
 * ends today; a year runs January to December, cut off at today.
 */
export type CalendarPeriod = "12m" | `${number}`;

export function calendarPeriodBounds(
  period: CalendarPeriod,
  today: Date,
): { start: Date; end: Date } {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (period === "12m") {
    return { start: new Date(end.getFullYear() - 1, end.getMonth(), end.getDate() + 1), end };
  }
  const year = Number(period);
  const yearEnd = new Date(year, 11, 31);
  return { start: new Date(year, 0, 1), end: yearEnd < end ? yearEnd : end };
}

/** "12m" first, then every year with a workout, newest first. */
export function calendarPeriods(workoutDates: readonly Date[], today: Date): CalendarPeriod[] {
  const years = new Set(workoutDates.map((date) => date.getFullYear()));
  years.add(today.getFullYear());
  return ["12m", ...[...years].sort((a, b) => b - a).map((year) => `${year}` as CalendarPeriod)];
}

export interface HeatmapColumn {
  weekStart: Date;
  /** One slot per weekday from the week start; days outside the period are blanked. */
  days: { date: Date; inPeriod: boolean }[];
  /** The month name to print over this column, when a month starts in it. */
  monthLabel: string | null;
}

/**
 * The year-at-a-glance grid: one column per week (per the user's week
 * start), seven rows of days, local dates throughout so a late-night
 * workout lands on the day the user lived it.
 */
export function heatmapColumns(start: Date, end: Date, weekStart: number): HeatmapColumn[] {
  const columns: HeatmapColumn[] = [];
  const cursor = startOfWeek(start, weekStart);
  let lastMonth = -1;
  while (cursor.getTime() <= end.getTime()) {
    const days: HeatmapColumn["days"] = [];
    let monthLabel: string | null = null;
    for (let i = 0; i < 7; i++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + i);
      const inPeriod = date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
      days.push({ date, inPeriod });
      if (inPeriod && date.getMonth() !== lastMonth && (date.getDate() === 1 || lastMonth === -1)) {
        monthLabel = date.toLocaleDateString(undefined, { month: "short" });
        lastMonth = date.getMonth();
      }
    }
    columns.push({ weekStart: new Date(cursor), days, monthLabel });
    cursor.setDate(cursor.getDate() + 7);
  }
  return columns;
}
