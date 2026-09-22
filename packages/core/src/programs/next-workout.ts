export type ProgramMode = "sequence" | "weekly";

export interface ProgramItemLike {
  routineId: string;
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

export type NextWorkoutReason = "sequence" | "scheduled-today" | "next-scheduled";

export interface NextWorkout<T extends ProgramItemLike = ProgramItemLike> {
  /** The program entry suggested — a routine can appear more than once. */
  item: T;
  routineId: string;
  reason: NextWorkoutReason;
  /** Local start-of-day the suggestion is scheduled for (weekly mode only). */
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

/** Completed, non-deleted sessions, most recent first. */
function completedSessions(sessions: readonly SessionLike[]): (SessionLike & { endedAt: Date })[] {
  return sessions
    .filter((s): s is SessionLike & { endedAt: Date } => !s.deletedAt && s.endedAt !== null)
    .sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime());
}

function nextInSequence<T extends ProgramItemLike>(
  items: readonly [T, ...T[]],
  sessions: readonly SessionLike[],
): NextWorkout<T> {
  const at = (index: number): T => items[index % items.length] ?? items[0];
  const inProgram = new Set(items.map((item) => item.routineId));
  // Sessions from routines outside the program are ignored rather than
  // resetting the rotation — a one-off accessory day shouldn't lose your place.
  const history = completedSessions(sessions).filter(
    (s) => s.routineId !== null && inProgram.has(s.routineId),
  );

  const suggest = (index: number): NextWorkout<T> => ({
    item: at(index),
    routineId: at(index).routineId,
    reason: "sequence",
    date: null,
    doneToday: false,
  });

  const [last, previous] = history;
  if (!last) return suggest(0);

  // A routine can appear more than once (A/B/A); use the session before it
  // to pick which occurrence was just done.
  const candidates = items.flatMap((item, index) =>
    item.routineId === last.routineId ? [index] : [],
  );
  let lastIndex = candidates[0] ?? -1;
  if (candidates.length > 1 && previous) {
    const match = candidates.find(
      (index) => at(index - 1 + items.length).routineId === previous.routineId,
    );
    if (match !== undefined) lastIndex = match;
  }
  return suggest(lastIndex + 1);
}

function nextOnSchedule<T extends ProgramItemLike>(
  items: readonly T[],
  sessions: readonly SessionLike[],
  now: Date,
): NextWorkout<T> | null {
  const scheduled = items.filter((item) => item.weekday !== null);
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
 * the program's routines, continuing after the most recently completed one;
 * weekly mode suggests today's scheduled routine, or — on a rest day or
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
    ? nextInSequence([first, ...rest], input.sessions)
    : nextOnSchedule(items, input.sessions, input.now);
}
