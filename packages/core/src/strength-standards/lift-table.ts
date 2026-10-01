import type { Sex, StandardLift, StrengthStandardTier } from "./types";

/**
 * Estimated-1RM standards as a multiple of bodyweight, by lift, sex and tier.
 * These are approximate, commonly-cited bodyweight-ratio figures for the same
 * five tiers strength-standard sites (e.g. strengthlevel.com/strength-standards)
 * publish — not a scrape of any single source's proprietary curve fit, which
 * this app has no access to. Good enough to place a lifter in the right
 * neighborhood; not a substitute for a coach.
 *
 * A ratio times bodyweight-in-any-unit gives a threshold in that same unit,
 * so these numbers work unmodified for lb or kg — the caller just has to be
 * consistent about which one it's passing as `bodyweight`.
 */
export const STANDARD_LIFT_BODYWEIGHT_MULTIPLIERS: Record<
  StandardLift,
  Record<Sex, Record<StrengthStandardTier, number>>
> = {
  squat: {
    male: { beginner: 0.75, novice: 1.0, intermediate: 1.5, advanced: 1.75, elite: 2.25 },
    female: { beginner: 0.5, novice: 0.75, intermediate: 1.0, advanced: 1.5, elite: 1.75 },
  },
  benchPress: {
    male: { beginner: 0.5, novice: 0.75, intermediate: 1.0, advanced: 1.5, elite: 1.75 },
    female: { beginner: 0.25, novice: 0.4, intermediate: 0.6, advanced: 0.9, elite: 1.1 },
  },
  deadlift: {
    male: { beginner: 1.0, novice: 1.25, intermediate: 1.75, advanced: 2.25, elite: 2.75 },
    female: { beginner: 0.75, novice: 1.0, intermediate: 1.5, advanced: 2.0, elite: 2.25 },
  },
  overheadPress: {
    male: { beginner: 0.35, novice: 0.5, intermediate: 0.75, advanced: 1.0, elite: 1.25 },
    female: { beginner: 0.2, novice: 0.3, intermediate: 0.45, advanced: 0.65, elite: 0.85 },
  },
};
