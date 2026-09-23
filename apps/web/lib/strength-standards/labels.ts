import type { StrengthStandardTier } from "@jim/core";

/** Display labels for strength-standard tiers, shared by every UI surface that shows one. */
export const STRENGTH_TIER_LABELS: Record<StrengthStandardTier, string> = {
  beginner: "Beginner",
  novice: "Novice",
  intermediate: "Intermediate",
  advanced: "Advanced",
  elite: "Elite",
};
