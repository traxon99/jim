import { uuidv7 } from "@jim/core";
import { scheduledWorkouts } from "@jim/db";
import { z } from "zod";
import type { UserContext } from "../context.js";
import { withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";
import { findRoutine } from "./find-routine.js";

/**
 * A plain calendar day. The app shows a scheduled workout in the viewer's own
 * timezone, and the server doesn't know a user's timezone, so a day is stored
 * as 12:00 UTC: that is the same calendar day for every zone from UTC-11 to
 * UTC+11, where midnight UTC would show as the previous evening in the US.
 */
export const SCHEDULE_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Input schema for `schedule_workout`'s `date`: a plain day, or a date-time with offset. */
export const scheduleDateSchema = z
  .union([z.string().regex(SCHEDULE_DATE_ONLY), z.string().datetime({ offset: true })])
  .refine(
    (value) => {
      try {
        return !Number.isNaN(parseScheduleDate(value).getTime());
      } catch {
        return false;
      }
    },
    { message: "Not a real calendar date" },
  );

/** Turns `YYYY-MM-DD` (stored as noon UTC) or an ISO date-time with offset into the instant to store. */
export function parseScheduleDate(value: string): Date {
  const match = SCHEDULE_DATE_ONLY.exec(value);
  if (!match) return new Date(value);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

export interface ScheduleWorkoutInput {
  /** A routine id or its exact name (#514). */
  routineId: string;
  /** `YYYY-MM-DD` (that calendar day, stored as noon UTC) or an ISO date-time with offset. */
  date: string;
  notes?: string;
  /** Preview only: run every check and return the result, then roll back (#245). */
  dryRun?: boolean;
}

export async function scheduleWorkout(context: UserContext, input: ScheduleWorkoutInput) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const routine = await findRoutine(tx, input.routineId);

    const scheduledFor = parseScheduleDate(input.date);
    const now = new Date();
    const id = uuidv7();
    await tx.insert(scheduledWorkouts).values({
      id,
      userId: context.userId,
      routineId: routine.id,
      scheduledFor,
      notes: input.notes ?? null,
      updatedAt: now,
      deviceId: MCP_DEVICE_ID,
    });

    return {
      id,
      routineId: routine.id,
      routineName: routine.name,
      scheduledFor: scheduledFor.toISOString(),
    };
  });
}
