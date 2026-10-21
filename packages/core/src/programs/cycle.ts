import type { NextWorkout, ProgramItemLike, ProgramMode } from "./next-workout";

export type CycleDayState = "past" | "today" | "upcoming";

export interface CycleDay {
  /** Workouts on this day, in program order; empty is a rest day. */
  routineIds: string[];
  /** Weekly mode: the weekday (0 = Sunday). Null in a sequence. */
  weekday: number | null;
  state: CycleDayState;
}

export interface ProgramCycle {
  days: CycleDay[];
  /** Index of today in `days`, or -1 when the program suggests nothing. */
  todayIndex: number;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

function stateFor(index: number, todayIndex: number): CycleDayState {
  if (todayIndex < 0 || index > todayIndex) return "upcoming";
  return index === todayIndex ? "today" : "past";
}

/**
 * Where today sits in the active program, for the Routines page's rotation
 * strip (issue #655). A sequence is one day per program step, with today on
 * the suggested workout, or on the rest day being taken before it. A weekly
 * program is one day per weekday in `weekdayOrder`.
 */
export function programCycle<T extends ProgramItemLike>(input: {
  mode: ProgramMode;
  items: readonly T[];
  next: Pick<NextWorkout<T>, "item" | "reason" | "date"> | null;
  now: Date;
  weekdayOrder: readonly number[];
}): ProgramCycle {
  const items = input.items
    .filter((item) => !item.deletedAt)
    .sort((a, b) => a.position - b.position);

  if (input.mode === "weekly") {
    const today = input.now.getDay();
    const todayIndex = input.weekdayOrder.indexOf(today);
    const days = input.weekdayOrder.map((weekday, index) => ({
      routineIds: items.flatMap((item) =>
        item.weekday === weekday && item.routineId !== null ? [item.routineId] : [],
      ),
      weekday,
      state: stateFor(index, todayIndex),
    }));
    return { days, todayIndex };
  }

  let todayIndex = -1;
  const next = input.next;
  if (next) {
    const nextIndex = items.findIndex((item) => item.position === next.item.position);
    todayIndex = nextIndex;
    // Resting before the next workout: step back one day per rest day left.
    if (nextIndex >= 0 && next.reason === "rest" && next.date) {
      const remaining = daysBetween(input.now, next.date);
      todayIndex = (((nextIndex - remaining) % items.length) + items.length) % items.length;
    }
  }
  const days = items.map((item, index) => ({
    routineIds: item.routineId === null ? [] : [item.routineId],
    weekday: null,
    state: stateFor(index, todayIndex),
  }));
  return { days, todayIndex };
}
