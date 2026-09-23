export type Sex = "male" | "female";

/**
 * The barbell lifts this app has published strength standards for. Kept
 * deliberately small and matched to the four lifts already curated as
 * canonical in packages/db's seed/aliases.ts (squat, bench, deadlift, OHP) —
 * extending coverage means adding both a multiplier row here and a slug
 * mapping in lift-mapping.ts.
 */
export type StandardLift = "squat" | "benchPress" | "deadlift" | "overheadPress";

/**
 * Five tiers, in ascending order — the same categories long used across the
 * strength-training community (e.g. https://strengthlevel.com/strength-standards)
 * for "where does this lift rank" tables.
 */
export const STRENGTH_STANDARD_TIERS = [
  "beginner",
  "novice",
  "intermediate",
  "advanced",
  "elite",
] as const;

export type StrengthStandardTier = (typeof STRENGTH_STANDARD_TIERS)[number];

/**
 * The subset of profile fields a standards lookup needs. `bodyweight` and any
 * resulting threshold are in whatever unit the caller supplies — the tables
 * are bodyweight ratios, so they're unit-independent as long as the caller is
 * consistent. `age` is in years; omit it to skip age adjustment entirely.
 */
export interface StrengthProfile {
  sex: Sex;
  bodyweight: number;
  age?: number | null;
}
