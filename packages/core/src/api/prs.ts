import { z } from "zod";
import { v1InstantSchema } from "./common";

/** One PR, `GET /v1/prs` (#740). Estimated 1RM and bodyweight reps PRs only, as in the app. */
export const v1PrSchema = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  /** "1rm" (estimated) or "reps_at_weight" (bodyweight movements). */
  kind: z.string(),
  value: z.number(),
  /** "lb", "kg" or "reps". */
  unit: z.string(),
  /** The best before this one, or null for the first. */
  previousValue: z.number().nullable(),
  achievedAt: v1InstantSchema,
  workoutId: z.string().nullable(),
  /** Strength-standard tier for a 1RM on a lift that has standards, else null. */
  tier: z.string().nullable(),
});
export type V1Pr = z.infer<typeof v1PrSchema>;

export const v1PrsSchema = z.object({
  /** More PRs fall in the window than `limit`. */
  hasMore: z.boolean(),
  prs: z.array(v1PrSchema),
});
export type V1Prs = z.infer<typeof v1PrsSchema>;
