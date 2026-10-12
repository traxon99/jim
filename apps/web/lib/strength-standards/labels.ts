import type { StandardLift, StrengthStandardTier } from "@jim/core";

/** Display labels for strength-standard tiers, shared by every UI surface that shows one. */
export const STRENGTH_TIER_LABELS: Record<StrengthStandardTier, string> = {
  beginner: "Beginner",
  novice: "Novice",
  intermediate: "Intermediate",
  advanced: "Advanced",
  elite: "Elite",
};

/** Display names for the lifts standards are published for, before one has been logged. */
export const STANDARD_LIFT_LABELS: Record<StandardLift, string> = {
  squat: "Barbell squat",
  benchPress: "Bench press",
  deadlift: "Deadlift",
  overheadPress: "Overhead press",
};
