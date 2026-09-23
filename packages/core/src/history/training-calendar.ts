export interface TrainingCalendarSession {
  startedAt: Date;
  totalVolume: number;
}

export interface TrainingDay {
  date: string;
  sessionCount: number;
  totalVolume: number;
}

/** Local (not UTC) calendar-day key, so a late-night session groups under the day the user experienced it. */
export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * "Calendar view of training history" (STORIES.md S7) — one entry per day
 * that had at least one session, keyed by `dateKey` so the UI can look up
 * any day in the grid it renders with the same key.
 */
export function buildTrainingCalendar(
  sessions: readonly TrainingCalendarSession[],
): Map<string, TrainingDay> {
  const days = new Map<string, TrainingDay>();

  for (const session of sessions) {
    const key = dateKey(session.startedAt);
    const existing = days.get(key);
    if (existing) {
      existing.sessionCount += 1;
      existing.totalVolume += session.totalVolume;
    } else {
      days.set(key, { date: key, sessionCount: 1, totalVolume: session.totalVolume });
    }
  }

  return days;
}
