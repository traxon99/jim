import type { NextWorkout } from "@jim/core";

/**
 * Whether today is a rest day in the program: a sequence resting before it
 * carries on, or a weekly day with nothing scheduled. A weekly day whose
 * workouts are all done isn't a rest day — you trained.
 */
export function isRestDay(next: Pick<NextWorkout, "reason" | "doneToday">): boolean {
  return next.reason === "rest" || (next.reason === "next-scheduled" && !next.doneToday);
}

function storageKey(programId: string): string {
  return `jim:rest-day-skipped:${programId}`;
}

/** Local calendar date as YYYY-MM-DD, so a skip lapses at midnight. */
export function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Whether today's rest day was skipped for this program on this device. */
export function readRestDaySkipped(programId: string, now: Date = new Date()): boolean {
  try {
    return window.localStorage.getItem(storageKey(programId)) === localDateKey(now);
  } catch {
    return false;
  }
}

export function writeRestDaySkipped(
  programId: string,
  skipped: boolean,
  now: Date = new Date(),
): void {
  try {
    if (skipped) window.localStorage.setItem(storageKey(programId), localDateKey(now));
    else window.localStorage.removeItem(storageKey(programId));
  } catch {
    // Private mode etc. — the skip still holds for this page life.
  }
}
