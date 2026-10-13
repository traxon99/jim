/**
 * The Epley formula (1RM = weight × (1 + reps / 30), `one-rep-max.ts`'s
 * default) solved for its other two terms, so every place that inverts it
 * agrees with the e1RM it started from.
 */

/** The weight that `reps` reps would take to match a one-rep max, unrounded. */
export function epleyWeightForReps(oneRepMax: number, reps: number): number {
  return oneRepMax / (1 + reps / 30);
}

/** How many reps `weight` could be lifted for before failure, given a one-rep max. */
export function epleyRepsToFailure(oneRepMax: number, weight: number): number {
  return 30 * (oneRepMax / weight - 1);
}
