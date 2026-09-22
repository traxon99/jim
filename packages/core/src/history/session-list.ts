import { type MonthGroup, groupByMonth } from "./month-grouping";
import { type WeekGroup, groupByWeek } from "./week-grouping";

export interface SessionListEntry {
  id: string;
  name: string | null;
  startedAt: Date;
  endedAt: Date | null;
  totalVolume: number;
  setCount: number;
  prCount: number;
}

/**
 * "Session list with summary stats, grouped by week" (STORIES.md S7).
 * Callers build each `SessionListEntry` with `summarizeSession`
 * (packages/core/src/sessions) before grouping; within a week, most recent
 * session first.
 */
export function groupSessionsByWeek(
  sessions: readonly SessionListEntry[],
  weekStart: number,
): WeekGroup<SessionListEntry>[] {
  return groupByWeek(sessions, weekStart, (session) => session.startedAt).map((group) => ({
    weekStart: group.weekStart,
    items: [...group.items].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
  }));
}

/**
 * "Session list with summary stats, grouped by month" (STORIES.md S7, issue
 * #57) — same shape as `groupSessionsByWeek`, bucketed by calendar month
 * instead so the history view can switch between the two.
 */
export function groupSessionsByMonth(
  sessions: readonly SessionListEntry[],
): MonthGroup<SessionListEntry>[] {
  return groupByMonth(sessions, (session) => session.startedAt).map((group) => ({
    monthStart: group.monthStart,
    items: [...group.items].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
  }));
}
