import { z } from "zod";
import { v1InstantSchema } from "./common";

const point = z.object({ value: z.number(), measuredAt: v1InstantSchema });

/** `GET /v1/body-measurements` (#741), converted to the user's units. */
export const v1BodyMeasurementsSchema = z.object({
  measurements: z.array(
    z.object({
      kind: z.string(),
      /** "lb", "kg", "in", "cm" or "pct" (body fat). */
      unit: z.string(),
      latest: point.nullable(),
      /** Latest minus the first point in range; null with fewer than two. */
      change: z.number().nullable(),
      points: z.array(point),
    }),
  ),
});
export type V1BodyMeasurements = z.infer<typeof v1BodyMeasurementsSchema>;
