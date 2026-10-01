export type ProgramMode = "sequence" | "weekly";

export interface ProgramItemLike {
  /** Null marks a rest day: a day off in a sequence, or a pinned weekday off. */
  routineId: string | null;
  position: number;
  /** 0 = Sunday .. 6 = Saturday; only read in weekly mode. */
  weekday: number | null;
  deletedAt: Date | null;
}

export interface SessionLike {
  routineId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  deletedAt: Date | null;
}

export type NextWorkoutReason = "sequence" | "rest" | "scheduled-today" | "next-scheduled";

/** A program entry that is a workout rather than a rest day. */
type WorkoutItem<T extends ProgramItemLike> = T & { routineId: string };

const isWorkout = <T extends ProgramItemLike>(item: T): item is WorkoutItem<T> =>
  item.routineId !== null;

export interface NextWorkout<T extends ProgramItemLike = ProgramItemLike> {
  /**
   * The program entry suggested — a routine can appear more than once. On a
   * sequence rest day ("rest") it's the workout that follows the rest.
   */
  item: T;
  routineId: string;
  reason: NextWorkoutReason;
  /**
   * Local start-of-day the suggestion is scheduled for: weekly mode, or the
   * day a sequence picks back up after a rest day.
   */
  date: Date | null;
  /** Weekly mode: something was scheduled today and it's all been completed. */
  doneToday: boolean;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** Calendar days from `a` to `b`, by local date so a DST change can't skew it. */
function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

/** Completed, non-deleted sessions, most recent first. */
function completedSessions(sessions: readonly SessionLike[]): (SessionLike & { endedAt: Date })[] {
  return sessions
    .filter((s): s is SessionLike & { endedAt: Date } => !s.deletedAt && s.endedAt !== null)
    .sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime());
}

function nextInSequence<T extends ProgramItemLike>(
  items: readonly [T, ...T[]],
  sessions: readonly SessionLike[],
  now: Date,
): NextWorkout<T> | null {
  const at = (index: number): T => items[index % items.length] ?? items[0];
  const firstWorkout = items.findIndex(isWorkout);
  if (firstWorkout === -1) return null;
  const inProgram = new Set(items.filter(isWorkout).map((item) => item.routineId));
  // Sessions from routines outside the program are ignored rather than
  // resetting the rotation — a one-off accessory day shouldn't lose your place.
  const history = completedSessions(sessions).filter(
    (s) => s.routineId !== null && inProgram.has(s.routineId),
  );

  const suggest = (
    index: number,
    reason: NextWorkoutReason = "sequence",
    date: Date | null = null,
  ): NextWorkout<T> => {
    const item = at(index) as WorkoutItem<T>;
    return { item, routineId: item.routineId, reason, date, doneToday: false };
  };

  const [last, previous] = history;
  // With nothing done yet there's no day to rest from, so start on a workout.
  if (!last) return suggest(firstWorkout);

  /** The nearest workout before `index`, skipping rest days. */
  const workoutBefore = (index: number): T | undefined => {
    for (let step = 1; step <= items.length; step++) {
      const item = at(index - step + items.length * 2);
      if (isWorkout(item)) return item;
    }
    return undefined;
  };

  // A routine can appear more than once (A/B/A); use the session before it
  // to pick which occurrence was just done.
  const candidates = items.flatMap((item, index) =>
    item.routineId === last.routineId ? [index] : [],
  );
  let lastIndex = candidates[0] ?? -1;
  if (candidates.length > 1 && previous) {
    const match = candidates.find(
      (index) => workoutBefore(index)?.routineId === previous.routineId,
    );
    if (match !== undefined) lastIndex = match;
  }

  // Rest days straight after the last workout each take one calendar day,
  // counted from the day it was done; then the rotation carries on.
  let rests = 0;
  while (rests < items.length && !isWorkout(at(lastIndex + 1 + rests))) rests++;
  const nextIndex = lastIndex + 1 + rests;
  if (rests > 0 && daysBetween(last.endedAt, now) <= rests) {
    const resume = startOfDay(last.endedAt);
    resume.setDate(resume.getDate() + rests + 1);
    return suggest(nextIndex, "rest", resume);
  }
  return suggest(nextIndex);
}

function nextOnSchedule<T extends ProgramItemLike>(
  items: readonly T[],
  sessions: readonly SessionLike[],
  now: Date,
): NextWorkout<T> | null {
  // A pinned rest day reads the same as an unscheduled one: nothing to do.
  const scheduled = items.filter(
    (item): item is WorkoutItem<T> => isWorkout(item) && item.weekday !== null,
  );
  if (scheduled.length === 0) return null;

  const today = now.getDay();
  const doneToday = new Set(
    completedSessions(sessions)
      .filter((s) => isSameLocalDay(s.endedAt, now))
      .map((s) => s.routineId),
  );

  const todays = scheduled.filter((item) => item.weekday === today);
  const pending = todays.find((item) => !doneToday.has(item.routineId));
  if (pending) {
    return {
      item: pending,
      routineId: pending.routineId,
      reason: "scheduled-today",
      date: startOfDay(now),
      doneToday: false,
    };
  }

  for (let offset = 1; offset <= 7; offset++) {
    const weekday = (today + offset) % 7;
    const upcoming = scheduled.find((item) => item.weekday === weekday);
    if (upcoming) {
      const date = startOfDay(now);
      date.setDate(date.getDate() + offset);
      return {
        item: upcoming,
        routineId: upcoming.routineId,
        reason: "next-scheduled",
        date,
        doneToday: todays.length > 0,
      };
    }
  }
  return null;
}

/**
 * Picks the workout a program suggests next. Sequence mode rotates through
 * the program's routines, continuing after the most recently completed one,
 * and spends a day resting for each rest day it reaches; weekly mode suggests today's scheduled routine, or — on a rest day or
 * once today's is done — the next scheduled one.
 */
export function suggestNextWorkout<T extends ProgramItemLike>(input: {
  mode: ProgramMode;
  items: readonly T[];
  sessions: readonly SessionLike[];
  now: Date;
}): NextWorkout<T> | null {
  const items = input.items
    .filter((item) => !item.deletedAt)
    .sort((a, b) => a.position - b.position);
  const [first, ...rest] = items;
  if (!first) return null;

  return input.mode === "sequence"
    ? nextInSequence([first, ...rest], input.sessions, input.now)
    : nextOnSchedule(items, input.sessions, input.now);
}
