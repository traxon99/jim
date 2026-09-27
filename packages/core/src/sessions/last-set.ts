import { type FocusExerciseCandidate, isFocusExerciseComplete } from "./focus-exercise";

/**
 * How many of an exercise's planned sets are still unlogged: the rows the
 * routine's target or last time's workout calls for (at least one), minus
 * the indices already logged. Unlike `plannedSetIndices`, this never grows
 * an extra row once the plan is done — zero means the plan is finished.
 */
export function remainingPlannedSetCount(
  targetSetCount: number | null,
  previousSetCount: number,
  loggedIndices: ReadonlySet<number>,
): number {
  const total = Math.max(targetSetCount ?? 0, previousSetCount, 1);
  let remaining = 0;
  for (let index = 0; index < total; index++) {
    if (!loggedIndices.has(index)) remaining += 1;
  }
  return remaining;
}

/**
 * Whether a just-logged set was the last one left in the whole workout
 * (issue #231): its own exercise has no planned sets remaining and every
 * other exercise is already done. There's nothing to rest for after it, so
 * no rest timer (or "time for your next set" push) should start.
 */
export function isLastRemainingSet(
  remainingInLoggedExercise: number,
  otherExercises: readonly FocusExerciseCandidate[],
): boolean {
  return remainingInLoggedExercise === 0 && otherExercises.every(isFocusExerciseComplete);
}
