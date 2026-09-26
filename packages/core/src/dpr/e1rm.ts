import { estimateOneRepMax } from "../one-rep-max";
import type { DprSet } from "./decide";

/**
 * RPE-adjusted estimated 1RM (issue #209): a set at RPE r left (10 − r) reps
 * in reserve, so it's treated as `reps + (10 − r)` reps to failure before
 * Epley is applied. RPE 10 (or no RPE) is plain Epley.
 */
export function rpeAdjustedE1rm(weight: number, reps: number, rpe: number | null): number {
  if (weight <= 0 || reps <= 0) return 0;
  const reserve = rpe === null ? 0 : Math.max(0, 10 - rpe);
  return estimateOneRepMax(weight, reps + reserve);
}

/** The best RPE-adjusted e1RM among a session's working sets, or 0. */
export function sessionE1rm(sets: readonly DprSet[]): number {
  let best = 0;
  for (const set of sets) {
    if (set.kind !== "working" || set.weight === null || set.reps === null) continue;
    best = Math.max(best, rpeAdjustedE1rm(set.weight, set.reps, set.rpe));
  }
  return best;
}
