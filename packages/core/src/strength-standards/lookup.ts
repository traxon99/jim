import { ageAdjustmentFactor } from "./age-adjustment";
import { STANDARD_LIFT_BODYWEIGHT_MULTIPLIERS } from "./lift-table";
import {
  STRENGTH_STANDARD_TIERS,
  type StandardLift,
  type StrengthProfile,
  type StrengthStandardTier,
} from "./types";

/** The estimated-1RM threshold for every tier of one lift, for one profile. */
export function liftStandardThresholds(
  lift: StandardLift,
  profile: StrengthProfile,
): Record<StrengthStandardTier, number> {
  const multipliers = STANDARD_LIFT_BODYWEIGHT_MULTIPLIERS[lift][profile.sex];
  const scale = ageAdjustmentFactor(profile.age) * profile.bodyweight;

  const thresholds = {} as Record<StrengthStandardTier, number>;
  for (const tier of STRENGTH_STANDARD_TIERS) {
    thresholds[tier] = Math.round(multipliers[tier] * scale * 100) / 100;
  }
  return thresholds;
}

/**
 * The highest tier `oneRepMax` clears, or `null` if it falls short of even
 * Beginner.
 */
export function tierForOneRepMax(
  lift: StandardLift,
  oneRepMax: number,
  profile: StrengthProfile,
): StrengthStandardTier | null {
  const thresholds = liftStandardThresholds(lift, profile);

  let cleared: StrengthStandardTier | null = null;
  for (const tier of STRENGTH_STANDARD_TIERS) {
    if (oneRepMax >= thresholds[tier]) cleared = tier;
  }
  return cleared;
}

/** The tier after `tier`, or `null` past Elite. `null` in means "before Beginner". */
export function nextTier(tier: StrengthStandardTier | null): StrengthStandardTier | null {
  const index = tier === null ? -1 : STRENGTH_STANDARD_TIERS.indexOf(tier);
  return STRENGTH_STANDARD_TIERS[index + 1] ?? null;
}
