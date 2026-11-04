import { z } from "zod";
import { v1DateSchema, v1InstantSchema } from "./common";

const plannedRoutine = z.object({
  routineId: z.string(),
  routineName: z.string(),
  exerciseCount: z.number().int(),
  /** Path of the routine in Jim (`/routines/<id>`); prefix it with Jim's origin. */
  webPath: z.string(),
});

/** `GET /v1/plan` (#742): what's planned. Display only; nothing here starts a workout. */
export const v1PlanSchema = z.object({
  scheduled: z.array(
    plannedRoutine.extend({
      date: v1DateSchema,
      /** The active program, when this routine is part of it. */
      programName: z.string().nullable(),
      notes: z.string().nullable(),
    }),
  ),
  /** The active program's next workout, as the Workout tab suggests it, or null. */
  next: plannedRoutine
    .extend({
      programName: z.string(),
      /** Weekly programs (and a sequence after a rest day): the day it's for. */
      date: v1DateSchema.nullable(),
      reason: z.enum(["sequence", "rest", "scheduled-today", "next-scheduled"]),
      doneToday: z.boolean(),
    })
    .nullable(),
});
export type V1Plan = z.infer<typeof v1PlanSchema>;

/** `GET /v1/dpr` (#742): the PR Progression picture `dpr_status` gives. */
export const v1DprSchema = z.object({
  enabled: z.boolean(),
  units: z.enum(["lb", "kg"]),
  block: z
    .object({
      /** "active", "deload" (show "Deload week") or "completed". */
      status: z.enum(["active", "deload", "completed"]),
      startedAt: v1InstantSchema,
      endsAt: v1InstantSchema,
      /** Current week, 1-based, capped at `weeks`. */
      week: z.number().int(),
      weeks: z.number().int(),
      ended: z.boolean(),
    })
    .nullable(),
  lifts: z.array(
    z.object({
      exerciseId: z.string(),
      name: z.string().nullable(),
      next: z.object({
        /** "increase", "hold", "deload", "reenter", "light" or "insufficient"; may grow. */
        call: z.string(),
        weight: z.number().nullable(),
        reps: z.number().int().nullable(),
        rpe: z.number().nullable(),
        reason: z.string(),
      }),
      e1rm: z.object({
        baseline: z.number().nullable(),
        current: z.number().nullable(),
        goal: z.number().nullable(),
      }),
      status: z.string().nullable(),
      lastDecision: z
        .object({ after: v1InstantSchema, call: z.string(), weight: z.number().nullable() })
        .nullable(),
    }),
  ),
});
export type V1Dpr = z.infer<typeof v1DprSchema>;
