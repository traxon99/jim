import { addWeeks, startOfWeek } from "@jim/core";

export interface WeekSessionLike {
  startedAt: Date;
  endedAt: Date | null;
  totalVolume: number;
  prCount: number;
}

export interface WeekSection<T extends WeekSessionLike> {
  /** Start of the week, in the user's week scheme. */
  start: Date;
  label: string;
  sessions: T[];
}

export interface WeekSummary {
  workouts: number;
  minutes: number;
  volume: number;
  prs: number;
}

const WEEK_OF = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** "This week", "Last week", then "Week of Nov 2" (#783). */
export function weekLabel(start: Date, now: Date, weekStart: number): string {
  const thisWeek = startOfWeek(now, weekStart);
  if (start.getTime() === thisWeek.getTime()) return "This week";
  if (start.getTime() === addWeeks(thisWeek, -1, weekStart).getTime()) return "Last week";
  return `Week of ${WEEK_OF.format(start)}`;
}

/**
 * Splits sessions (newest first) into weeks for History's list (#783),
 * keeping their order. Weeks with no sessions are left out.
 */
export function groupSessionsByWeek<T extends WeekSessionLike>(
  sessions: readonly T[],
  weekStart: number,
  now: Date,
): WeekSection<T>[] {
  const sections: WeekSection<T>[] = [];
  for (const session of sessions) {
    const start = startOfWeek(session.startedAt, weekStart);
    const last = sections[sections.length - 1];
    if (last && last.start.getTime() === start.getTime()) {
      last.sessions.push(session);
    } else {
      sections.push({ start, label: weekLabel(start, now, weekStart), sessions: [session] });
    }
  }
  return sections;
}

/** Totals for one week's one-line summary on History (#783). */
export function summarizeWeek(sessions: readonly WeekSessionLike[]): WeekSummary {
  let minutes = 0;
  let volume = 0;
  let prs = 0;
  for (const session of sessions) {
    if (session.endedAt)
      minutes += (session.endedAt.getTime() - session.startedAt.getTime()) / 60_000;
    volume += session.totalVolume;
    prs += session.prCount;
  }
  return { workouts: sessions.length, minutes, volume, prs };
}
