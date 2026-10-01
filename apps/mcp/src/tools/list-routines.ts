import { routineExercises, routines, sessions } from "@jim/db";
import { and, asc, count, inArray, isNotNull, isNull, max } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";

export interface ListRoutinesInput {
  folder?: string;
  query?: string;
}

/**
 * Every live routine for this user, logged or not, with its exercise count
 * and when it was last finished — the way to discover a `routineId` for
 * `get_routine` / `update_routine` / `schedule_workout` (#370).
 */
export async function listRoutines(context: UserContext, input: ListRoutinesInput) {
  return withUser(context, async (tx) => {
    const rows = await tx
      .select()
      .from(routines)
      .where(isNull(routines.deletedAt))
      .orderBy(asc(routines.position), asc(routines.name));

    const folder = input.folder?.trim().toLowerCase();
    const query = input.query?.trim().toLowerCase();
    const matching = rows.filter(
      (routine) =>
        (!folder || (routine.folder ?? "").toLowerCase() === folder) &&
        (!query || routine.name.toLowerCase().includes(query)),
    );
    if (matching.length === 0) return [];

    const ids = matching.map((routine) => routine.id);
    const exerciseCounts = await tx
      .select({ routineId: routineExercises.routineId, count: count() })
      .from(routineExercises)
      .where(and(inArray(routineExercises.routineId, ids), isNull(routineExercises.deletedAt)))
      .groupBy(routineExercises.routineId);
    const lastPerformed = await tx
      .select({ routineId: sessions.routineId, at: max(sessions.startedAt) })
      .from(sessions)
      .where(
        and(
          inArray(sessions.routineId, ids),
          isNull(sessions.deletedAt),
          isNotNull(sessions.endedAt),
        ),
      )
      .groupBy(sessions.routineId);

    const countById = new Map(exerciseCounts.map((row) => [row.routineId, row.count]));
    const lastById = new Map(lastPerformed.map((row) => [row.routineId, row.at]));

    return matching.map((routine) => ({
      id: routine.id,
      name: routine.name,
      folder: routine.folder,
      notes: routine.notes,
      kind: routine.kind,
      exerciseCount: countById.get(routine.id) ?? 0,
      lastPerformedAt: lastById.get(routine.id)?.toISOString() ?? null,
    }));
  });
}
