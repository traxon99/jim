import { liftStandardThresholds } from "./lookup";
import {
  STRENGTH_STANDARD_TIERS,
  type StandardLift,
  type StrengthProfile,
  type StrengthStandardTier,
} from "./types";

/**
 * Inverse of the Epley formula (`one-rep-max.ts`'s default): given a target
 * 1RM and a rep count, the working weight expected to hit that 1RM for that
 * many reps. Working sets are rarely done for 1 rep, so a suggested weight
 * needs this rather than the raw 1RM threshold.
 */
export function weightForTargetReps(oneRepMax: number, reps: number): number {
  if (oneRepMax <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(oneRepMax * 100) / 100;

  const raw = oneRepMax / (1 + reps / 30);
  return Math.round(raw * 100) / 100;
}

/**
 * A suggested working weight for `reps` reps, at every standards tier, for
 * one lift and profile — e.g. "Novice 95 · Intermediate 135 · Advanced 185"
 * at 5 reps. Meant to seed the weight input for an exercise with no logged
 * history yet, or to give a lifter with history a concrete "next tier"
 * target alongside their PR.
 */
export function suggestedWeightsByTier(
  lift: StandardLift,
  profile: StrengthProfile,
  reps: number,
): Record<StrengthStandardTier, number> {
  const thresholds = liftStandardThresholds(lift, profile);

  const result = {} as Record<StrengthStandardTier, number>;
  for (const tier of STRENGTH_STANDARD_TIERS) {
    result[tier] = weightForTargetReps(thresholds[tier], reps);
  }
  return result;
}
