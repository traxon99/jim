import { z } from "zod";
import { v1InstantSchema, v1UnitsSchema } from "./common";

/** `GET /v1/status`: who the token belongs to and how fresh Jim's data is. */
export const v1StatusSchema = z.object({
  user: z.object({
    username: z.string().nullable(),
    units: v1UnitsSchema,
    /** 0 = Sunday … 6 = Saturday. */
    weekStart: z.number().int().min(0).max(6),
    /** IANA zone, or null when the phone hasn't reported one yet. */
    timeZone: z.string().nullable(),
  }),
  /** When the phone last pushed anything. Data only reaches Jim's server on sync. */
  lastSyncedAt: v1InstantSchema.nullable(),
  /** A workout in progress, for display only: nothing in /v1 can change it (ADR-007). */
  activeWorkout: z
    .object({ id: z.string(), name: z.string().nullable(), startedAt: v1InstantSchema })
    .nullable(),
  tokenScope: z.enum(["read", "read_write"]),
});
export type V1Status = z.infer<typeof v1StatusSchema>;
