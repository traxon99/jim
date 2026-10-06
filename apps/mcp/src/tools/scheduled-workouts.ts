import { routines, scheduledWorkouts } from "@jim/db";
import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser, withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";

/** Planned workouts from `schedule_workout`, soonest first; past ones only when `includePast`. */
export async function listScheduledWorkouts(
  context: UserContext,
  input: { includePast?: boolean },
) {
  return withUser(context, async (tx) => {
    const conditions = [isNull(scheduledWorkouts.deletedAt)];
    if (!input.includePast) conditions.push(gte(scheduledWorkouts.scheduledFor, startOfToday()));
    const rows = await tx
      .select({
        id: scheduledWorkouts.id,
        routineId: scheduledWorkouts.routineId,
        routineName: routines.name,
        scheduledFor: scheduledWorkouts.scheduledFor,
        notes: scheduledWorkouts.notes,
      })
      .from(scheduledWorkouts)
      .leftJoin(routines, eq(routines.id, scheduledWorkouts.routineId))
      .where(and(...conditions))
      .orderBy(asc(scheduledWorkouts.scheduledFor));
    return rows.map((row) => ({ ...row, scheduledFor: row.scheduledFor.toISOString() }));
  });
}

/** UTC midnight today: a workout planned for earlier today still counts as upcoming. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function cancelScheduledWorkout(
  context: UserContext,
  input: { id: string; dryRun?: boolean },
) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const [row] = await tx
      .select()
      .from(scheduledWorkouts)
      .where(eq(scheduledWorkouts.id, input.id));
    if (!row || row.deletedAt) {
      throw new Error(
        `No scheduled workout found with id ${input.id}. Try list_scheduled_workouts.`,
      );
    }
    const now = new Date();
    await tx
      .update(scheduledWorkouts)
      .set({
        deletedAt: now,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(scheduledWorkouts.id, row.id));
    return { id: row.id, scheduledFor: row.scheduledFor.toISOString(), cancelled: true };
  });
}
