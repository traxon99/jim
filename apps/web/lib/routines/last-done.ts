import type { SessionRow } from "@/lib/db/schema";

/** When each routine was last finished (issue #329), from the session rows. */
export function lastDoneByRoutine(
  sessions: readonly Pick<SessionRow, "routineId" | "startedAt" | "endedAt" | "deletedAt">[],
): Map<string, Date> {
  const map = new Map<string, Date>();
  for (const session of sessions) {
    if (!session.routineId || !session.endedAt || session.deletedAt) continue;
    const previous = map.get(session.routineId);
    if (!previous || session.startedAt > previous) map.set(session.routineId, session.startedAt);
  }
  return map;
}

function calendarDaysBetween(earlier: Date, later: Date): number {
  const a = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const b = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  return Math.round((b - a) / 86_400_000);
}

/**
 * "Today", "Yesterday", "3 days ago", "2 weeks ago", then a date — the
 * subtitle on each routine row of the Workout tab (issue #329).
 */
export function formatLastDone(date: Date, now: Date = new Date()): string {
  const days = calendarDaysBetween(date, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 63) return `${Math.floor(days / 7)} weeks ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}
