import { z } from "zod";
import { v1DateSchema } from "./common";

/** One training week, `GET /v1/weeks` (#738). Working sets only (#395). */
export const v1WeekSchema = z.object({
  /** The week's first day in the user's zone and week-start setting. */
  weekStart: v1DateSchema,
  workouts: z.number().int(),
  workingSets: z.number().int(),
  /** Weight × reps, in the user's units. */
  volume: z.number(),
  /** Minutes across the finished workouts that started this week. */
  durationMinutes: z.number().int(),
  /** Working sets per muscle against the goal's weekly range; a secondary muscle counts half. */
  muscles: z.array(
    z.object({
      muscle: z.string(),
      sets: z.number(),
      target: z.object({ low: z.number(), high: z.number() }),
      status: z.enum(["under", "within", "over"]),
    }),
  ),
  /** Top 5 exercises by volume. */
  topExercises: z.array(
    z.object({
      exerciseId: z.string(),
      name: z.string(),
      sets: z.number().int(),
      volume: z.number(),
    }),
  ),
});
export type V1Week = z.infer<typeof v1WeekSchema>;

export const v1WeeksSchema = z.object({
  goal: z.enum(["strength", "hypertrophy"]),
  units: z.enum(["lb", "kg"]),
  /** Newest first; a rest week is included with zeros. */
  weeks: z.array(v1WeekSchema),
});
export type V1Weeks = z.infer<typeof v1WeeksSchema>;

/** `GET /v1/streak` (#738): the same streak the Home tab shows. */
export const v1StreakSchema = z.object({
  /** Consecutive weeks meeting the target, ending this week or last. */
  weeks: z.number().int(),
  /** Workouts a week needs to count. */
  target: z.number().int(),
  thisWeek: z.object({ done: z.number().int(), target: z.number().int() }),
  longest: z.number().int(),
});
export type V1Streak = z.infer<typeof v1StreakSchema>;
