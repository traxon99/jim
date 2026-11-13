import { type CycleDay, type ProgramCycle, type ProgramMode, dateKey } from "@jim/core";

/** At most this many day rows, so the active program fits Plan's first view (#787). */
export const MAX_PROGRAM_DAY_ROWS = 7;

export interface ProgramDayRow {
  /** Position in the cycle, for "Day N" in a rotation. */
  index: number;
  day: CycleDay;
  isToday: boolean;
  /** A finished workout of this day's routine landed on it. */
  done: boolean;
}

interface FinishedSession {
  routineId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  deletedAt: Date | null;
}

/**
 * The active program's days as rows for Plan's program card (#787): the whole
 * cycle when it's a week or shorter, otherwise a window of seven around today
 * so the card never outgrows the first screen.
 *
 * A weekly day is done when a finished workout of one of its routines was
 * started on that date this week. A rotation has no dates, so its past days
 * count as done, as the week strip already shows them.
 */
export function programDayRows({
  cycle,
  mode,
  today,
  sessions,
  maxRows = MAX_PROGRAM_DAY_ROWS,
}: {
  cycle: ProgramCycle;
  mode: ProgramMode;
  today: Date;
  sessions: readonly FinishedSession[];
  maxRows?: number;
}): ProgramDayRow[] {
  const { days, todayIndex } = cycle;

  const doneOn = new Map<string, Set<string>>();
  if (mode === "weekly") {
    for (const session of sessions) {
      if (!session.endedAt || session.deletedAt || !session.routineId) continue;
      const key = dateKey(session.startedAt);
      const set = doneOn.get(key) ?? new Set<string>();
      set.add(session.routineId);
      doneOn.set(key, set);
    }
  }

  const rows = days.map((day, index): ProgramDayRow => {
    const isToday = index === todayIndex;
    let done = false;
    if (mode === "weekly" && todayIndex >= 0 && day.routineIds.length > 0) {
      const date = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + index - todayIndex,
      );
      const finished = doneOn.get(dateKey(date));
      done = index <= todayIndex && day.routineIds.some((id) => finished?.has(id));
    } else if (mode === "sequence") {
      done = day.state === "past";
    }
    return { index, day, isToday, done };
  });

  if (rows.length <= maxRows) return rows;
  // Keep today in view: two days of context before it, the rest after.
  const anchor = Math.max(0, todayIndex);
  const start = Math.min(Math.max(0, anchor - 2), rows.length - maxRows);
  return rows.slice(start, start + maxRows);
}
