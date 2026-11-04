import { z } from "zod";
import { v1DateSchema } from "./common";

/** `GET /v1/lifts` (#740): estimated-1RM trend per lift. */
export const v1LiftSchema = z.object({
  exerciseId: z.string(),
  name: z.string(),
  /** Best estimated 1RM per day in the user's zone, oldest first. */
  points: z.array(z.object({ date: v1DateSchema, e1rm: z.number() })),
  /** The latest point's value, or null with no points. */
  current: z.number().nullable(),
  /** The highest point in range, or null. */
  best: z.number().nullable(),
  /** Where the 1RM likely is now (#713), or null without enough history. */
  predicted: z
    .object({
      value: z.number(),
      confidence: z.enum(["low", "medium", "high"]),
      /** Weight per week the trend is moving. */
      trendPerWeek: z.number(),
    })
    .nullable(),
});
export type V1Lift = z.infer<typeof v1LiftSchema>;

export const v1LiftsSchema = z.object({
  units: z.enum(["lb", "kg"]),
  /** How the lifts were picked: the `exercises` param, PRP focus lifts, or most trained. */
  selection: z.enum(["explicit", "dpr", "most_trained"]),
  lifts: z.array(v1LiftSchema),
});
export type V1Lifts = z.infer<typeof v1LiftsSchema>;
