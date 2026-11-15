import { KEEP_AS_ROUTINE, finishedRoutineIds, oneOffLifetime, oneOffStatus } from "@jim/core";
import { routineExercises, routines, sessions } from "@jim/db";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser, withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";
import { RoutineLookupError, findRoutine, nextRoutinePosition } from "./find-routine.js";

/**
 * The user's one-off workouts (issue #798) that haven't ended: not finished,
 * not discarded and not past their deadline. A day one-off counts until noon
 * UTC the next day, since the server doesn't know the user's timezone.
 */
export async function listOneOffWorkouts(context: UserContext) {
  return withUser(context, async (tx) => {
    const rows = await tx
      .select()
      .from(routines)
      .where(and(isNull(routines.deletedAt), eq(routines.oneOff, true)));
    if (rows.length === 0) return [];
    const ids = rows.map((routine) => routine.id);
    const used = await tx
      .select({
        routineId: sessions.routineId,
        endedAt: sessions.endedAt,
        deletedAt: sessions.deletedAt,
      })
      .from(sessions)
      .where(inArray(sessions.routineId, ids));
    const clock = { now: new Date(), finished: finishedRoutineIds(used) };
    const counts = await tx
      .select({ routineId: routineExercises.routineId, count: count() })
      .from(routineExercises)
      .where(and(inArray(routineExercises.routineId, ids), isNull(routineExercises.deletedAt)))
      .groupBy(routineExercises.routineId);
    const countById = new Map(counts.map((row) => [row.routineId, row.count]));
    const inProgress = new Set(
      used.filter((s) => s.routineId && !s.endedAt && !s.deletedAt).map((s) => s.routineId),
    );

    return rows
      .map((routine) => ({ routine, status: oneOffStatus(routine, clock) }))
      .filter(({ status }) => status !== "ended")
      .sort((a, b) => a.routine.createdAt.getTime() - b.routine.createdAt.getTime())
      .map(({ routine, status }) => {
        const lifetime = oneOffLifetime(routine);
        return {
          id: routine.id,
          name: routine.name,
          notes: routine.notes,
          lifetime: typeof lifetime === "object" ? "day" : lifetime,
          expiresAt: routine.oneOffExpiresAt?.toISOString() ?? null,
          day: routine.oneOffDay,
          status: inProgress.has(routine.id) ? "in_progress" : status,
          exerciseCount: countById.get(routine.id) ?? 0,
          createdAt: routine.createdAt.toISOString(),
        };
      });
  });
}

/**
 * Keeps a one-off as a normal routine, like the phone's "Save as routine":
 * it moves to the end of the routine list and no longer expires.
 */
export async function saveOneOffAsRoutine(
  context: UserContext,
  input: { routine: string; dryRun?: boolean },
) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const routine = await findRoutine(tx, input.routine);
    if (!routine.oneOff) {
      throw new RoutineLookupError(`"${routine.name}" is already a routine.`);
    }
    const now = new Date();
    await tx
      .update(routines)
      .set({
        ...KEEP_AS_ROUTINE,
        position: await nextRoutinePosition(tx),
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(routines.id, routine.id));
    return { id: routine.id, name: routine.name, saved: true };
  });
}
