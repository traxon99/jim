import type { trackingTypeEnum } from "../schema";

export type TrackingType = (typeof trackingTypeEnum.enumValues)[number];

export interface TrackingTypeInput {
  name: string;
  category: string | null;
  equipment: string | null;
}

const BODYWEIGHT_EQUIPMENT = new Set(["body only", null]);

// Cardio done in place, where only the time means anything (issue #423).
const TIME_ONLY_CARDIO = /\b(rope jumping|stairmaster|step mill)\b/i;

// Isometric holds are measured in seconds, not reps (issue #456).
const TIMED_HOLD = /\b(planks?|side bridge|wall sit|l-sit|dead hang|hollow hold)\b/i;

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
    return TIME_ONLY_CARDIO.test(exercise.name) ? "time" : "distance_time";
  }
  if (BODYWEIGHT_EQUIPMENT.has(exercise.equipment)) {
    return TIMED_HOLD.test(exercise.name) ? "time" : "bodyweight";
  }
  return "weight_reps";
}
