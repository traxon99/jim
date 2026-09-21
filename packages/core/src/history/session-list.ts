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
