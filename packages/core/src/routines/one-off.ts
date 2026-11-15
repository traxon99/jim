/**
 * One-off workouts (issue #798): a routine row with `oneOff` set, made almost
 * always by the AI through the MCP for a single session. It never shows in
 * Plan or a routine list, and it ends on its own: when a workout started
 * from it is finished, or at its deadline. Nothing deletes the row; every
 * reader decides with {@link oneOffStatus}.
 *
 * Three lifetimes, picked by the AI per request:
 * - `24h`: deadline = creation + 24 hours (`oneOffExpiresAt`).
 * - a day: lives through that calendar day in the phone's own timezone
 *   (`oneOffDay`, `YYYY-MM-DD`). The server doesn't know the timezone, so it
 *   keeps one listed until noon UTC the next day, which is past midnight
 *   everywhere from UTC-12 to UTC+12.
 * - `until_done`: no deadline.
 */

export const ONE_OFF_HOURS = 24;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const HOUR_MS = 60 * 60 * 1000;

export type OneOffLifetime = "24h" | "until_done" | { day: string };

export interface OneOffRoutine {
  id: string;
  oneOff: boolean;
  oneOffExpiresAt: Date | null;
  oneOffDay: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

/** The lifetime fields to write for a new one-off made at `now`. Throws on a malformed day. */
export function oneOffFields(
  lifetime: OneOffLifetime,
  now: Date,
): { oneOff: true; oneOffExpiresAt: Date | null; oneOffDay: string | null } {
  if (lifetime === "24h") {
    return {
      oneOff: true,
      oneOffExpiresAt: new Date(now.getTime() + ONE_OFF_HOURS * HOUR_MS),
      oneOffDay: null,
    };
  }
  if (lifetime === "until_done") return { oneOff: true, oneOffExpiresAt: null, oneOffDay: null };
  if (!isCalendarDay(lifetime.day)) throw new Error(`Not a calendar day: ${lifetime.day}`);
  return { oneOff: true, oneOffExpiresAt: null, oneOffDay: lifetime.day };
}

/** The fields that turn a one-off into a normal routine ("Save as routine"). */
export const KEEP_AS_ROUTINE = { oneOff: false, oneOffExpiresAt: null, oneOffDay: null } as const;

export function isCalendarDay(value: string): boolean {
  const match = DAY_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Which lifetime a one-off row has, or null for a normal routine. */
export function oneOffLifetime(routine: OneOffRoutine): OneOffLifetime | null {
  if (!routine.oneOff) return null;
  if (routine.oneOffDay) return { day: routine.oneOffDay };
  if (routine.oneOffExpiresAt) return "24h";
  return "until_done";
}

export type OneOffStatus = "upcoming" | "live" | "ended";

export interface OneOffClock {
  now: Date;
  /**
   * Today as `YYYY-MM-DD` in the viewer's timezone (the phone). Leave it out
   * on the server, which then uses the UTC bounds every timezone agrees on.
   */
  today?: string;
  /** Routine ids with a finished, non-deleted session (see {@link finishedRoutineIds}). */
  finished: ReadonlySet<string>;
}

/** Where a one-off is in its life. A normal routine is always "live". */
export function oneOffStatus(routine: OneOffRoutine, clock: OneOffClock): OneOffStatus {
  if (routine.deletedAt) return "ended";
  if (!routine.oneOff) return "live";
  if (clock.finished.has(routine.id)) return "ended";
  if (routine.oneOffExpiresAt && clock.now.getTime() >= routine.oneOffExpiresAt.getTime()) {
    return "ended";
  }
  const day = routine.oneOffDay;
  if (!day) return "live";
  if (clock.today !== undefined) {
    if (clock.today > day) return "ended";
    return clock.today < day ? "upcoming" : "live";
  }
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const now = clock.now.getTime();
  // Noon UTC the next day: past the end of that day for UTC-12..UTC+12.
  if (now >= Date.UTC(year, month - 1, date + 1, 12)) return "ended";
  // The day starts earliest in UTC+14, at 10:00 UTC the day before.
  return now < Date.UTC(year, month - 1, date - 1, 10) ? "upcoming" : "live";
}

interface SessionLike {
  routineId: string | null;
  endedAt: Date | null;
  deletedAt: Date | null;
}

/** Routines with at least one finished workout: finishing one ends a one-off. */
export function finishedRoutineIds(sessions: readonly SessionLike[]): Set<string> {
  const ids = new Set<string>();
  for (const session of sessions) {
    if (session.routineId && session.endedAt && !session.deletedAt) ids.add(session.routineId);
  }
  return ids;
}

/** Routines with any workout, finished or in progress. */
export function startedRoutineIds(sessions: readonly SessionLike[]): Set<string> {
  const ids = new Set<string>();
  for (const session of sessions) {
    if (session.routineId && !session.deletedAt) ids.add(session.routineId);
  }
  return ids;
}

/**
 * The older one-offs a new one replaces. Only a new 24h or until-done
 * one-off replaces anything, and only older unstarted one-offs of those two
 * kinds: day one-offs live side by side (Saturday and Monday), so Lift never
 * stacks up "today" cards.
 */
export function oneOffsReplacedBy(
  lifetime: OneOffLifetime,
  routines: readonly OneOffRoutine[],
  started: ReadonlySet<string>,
): string[] {
  if (typeof lifetime === "object") return [];
  return routines
    .filter(
      (routine) =>
        routine.oneOff && !routine.deletedAt && !routine.oneOffDay && !started.has(routine.id),
    )
    .map((routine) => routine.id);
}

/**
 * How much of a live one-off's time is left, 1 → 0, for the draining ring;
 * null when there's no deadline (until done). A day one-off drains over the
 * day: pass the local start and end of that day.
 */
export function oneOffTimeLeft(
  routine: OneOffRoutine,
  now: Date,
  localDay?: { start: Date; end: Date },
): number | null {
  let start: number;
  let end: number;
  if (routine.oneOffExpiresAt) {
    start = routine.createdAt.getTime();
    end = routine.oneOffExpiresAt.getTime();
  } else if (routine.oneOffDay && localDay) {
    start = Math.max(localDay.start.getTime(), routine.createdAt.getTime());
    end = localDay.end.getTime();
  } else {
    return null;
  }
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (end - now.getTime()) / (end - start)));
}
