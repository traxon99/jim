import { uuidv7 } from "@jim/core";
import { routines, scheduledWorkouts } from "@jim/db";
import { eq } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";
import { RoutineNotFoundError } from "./update-routine.js";

export interface ScheduleWorkoutInput {
  routineId: string;
  date: string;
  notes?: string;
  /** Preview only: run every check and return the result, then roll back (#245). */
  dryRun?: boolean;
}

export async function scheduleWorkout(context: UserContext, input: ScheduleWorkoutInput) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const [routine] = await tx.select().from(routines).where(eq(routines.id, input.routineId));
    if (!routine || routine.deletedAt) throw new RoutineNotFoundError(input.routineId);

    const now = new Date();
    const id = uuidv7();
    await tx.insert(scheduledWorkouts).values({
      id,
      userId: context.userId,
      routineId: input.routineId,
      scheduledFor: new Date(input.date),
      notes: input.notes ?? null,
      updatedAt: now,
      deviceId: MCP_DEVICE_ID,
    });

    return { id, routineId: input.routineId, routineName: routine.name, scheduledFor: input.date };
  });
}
