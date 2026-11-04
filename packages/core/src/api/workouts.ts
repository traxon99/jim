import { z } from "zod";
import { v1InstantSchema } from "./common";

/** One finished workout, `GET /v1/workouts` (#739). */
export const v1WorkoutSummarySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  routineName: z.string().nullable(),
  startedAt: v1InstantSchema,
  endedAt: v1InstantSchema,
  durationMinutes: z.number().int(),
  exerciseCount: z.number().int(),
  workingSets: z.number().int(),
  /** Weight × reps over working sets, in the user's units. */
  volume: z.number(),
  prCount: z.number().int(),
  gym: z.string().nullable(),
  /** Path of the workout in Jim's web portal; prefix it with Jim's origin. */
  webPath: z.string(),
});
export type V1WorkoutSummary = z.infer<typeof v1WorkoutSummarySchema>;

export const v1WorkoutsSchema = z.object({
  units: z.enum(["lb", "kg"]),
  /** More finished workouts match than `limit`; page on with `to`. */
  hasMore: z.boolean(),
  workouts: z.array(v1WorkoutSummarySchema),
});
export type V1Workouts = z.infer<typeof v1WorkoutsSchema>;

/** `GET /v1/workouts/:id`: current sets only (edits resolved, deletions dropped). */
export const v1WorkoutSchema = v1WorkoutSummarySchema.extend({
  notes: z.string().nullable(),
  exercises: z.array(
    z.object({
      exerciseId: z.string(),
      name: z.string(),
      notes: z.string().nullable(),
      sets: z.array(
        z.object({
          kind: z.string(),
          weight: z.number().nullable(),
          reps: z.number().int().nullable(),
          durationSeconds: z.number().int().nullable(),
          distance: z.number().nullable(),
          rpe: z.number().nullable(),
          rir: z.number().int().nullable(),
          completedAt: v1InstantSchema,
          /** PR kinds this set set that the app shows: "1rm", or "reps_at_weight" on bodyweight moves. */
          prs: z.array(z.string()),
        }),
      ),
    }),
  ),
});
export type V1Workout = z.infer<typeof v1WorkoutSchema>;
