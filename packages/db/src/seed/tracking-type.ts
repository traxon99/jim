import type { trackingTypeEnum } from "../schema";

export type TrackingType = (typeof trackingTypeEnum.enumValues)[number];

export interface TrackingTypeInput {
  name: string;
  category: string | null;
  equipment: string | null;
}

const BODYWEIGHT_EQUIPMENT = new Set(["body only", null]);

/**
 * free-exercise-db has no tracking_type field, so this assigns one per
 * exercise. Every branch is a judgment call, not a fact recovered from the
 * data — good enough to make every row loggable, not a claim of precision.
 */
export function classifyTrackingType(exercise: TrackingTypeInput): TrackingType {
  if (/\bweighted\b/i.test(exercise.name) && BODYWEIGHT_EQUIPMENT.has(exercise.equipment)) {
    return "weighted_bodyweight";
  }
  if (exercise.category === "stretching") {
    return "time";
  }
  if (exercise.category === "cardio") {
    return "distance";
  }
  if (BODYWEIGHT_EQUIPMENT.has(exercise.equipment)) {
    return "bodyweight";
  }
  return "weight_reps";
}
