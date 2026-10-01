import { exercises, routineExercises, routines } from "@jim/db";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";
import type { CreateRoutineExerciseInput } from "./create-routine.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RoutineLookupError extends Error {}

export interface GetRoutineInput {
  /** A routine id, or its name (case-insensitive exact match). */
  routine: string;
}

/**
 * One routine's template, its exercises in order with their targets (#370).
 * Each exercise is in the shape `create_routine` / `update_routine` accept
 * (`exercise` is the id, unset targets are omitted rather than null), so the
 * list can be edited and passed straight back to `update_routine`.
 */
export async function getRoutine(context: UserContext, input: GetRoutineInput) {
  return withUser(context, async (tx) => {
    const live = isNull(routines.deletedAt);
    const key = input.routine.trim();
    let candidates = UUID_RE.test(key)
      ? await tx
          .select()
          .from(routines)
          .where(and(live, eq(routines.id, key)))
      : [];
    if (candidates.length === 0) {
      const all = await tx.select().from(routines).where(live);
      candidates = all.filter((routine) => routine.name.toLowerCase() === key.toLowerCase());
    }

    const [routine, ...others] = candidates;
    if (!routine) {
      throw new RoutineLookupError(
        `No routine matches "${input.routine}". Try list_routines to see what exists.`,
      );
    }
    if (others.length > 0) {
      throw new RoutineLookupError(
        `${candidates.length} routines are named "${input.routine}" (${candidates.map((r) => r.id).join(", ")}). Pass one of those ids instead.`,
      );
    }

    const items = await tx
      .select()
      .from(routineExercises)
      .where(and(eq(routineExercises.routineId, routine.id), isNull(routineExercises.deletedAt)))
      .orderBy(asc(routineExercises.position));
    const exerciseIds = [...new Set(items.map((item) => item.exerciseId))];
    const names = exerciseIds.length
      ? await tx
          .select({ id: exercises.id, name: exercises.name })
          .from(exercises)
          .where(inArray(exercises.id, exerciseIds))
      : [];
    const nameById = new Map(names.map((row) => [row.id, row.name]));

    return {
      id: routine.id,
      name: routine.name,
      folder: routine.folder,
      notes: routine.notes,
      kind: routine.kind,
      exercises: items.map((item) => {
        const entry: CreateRoutineExerciseInput & { exerciseName: string | null } = {
          exercise: item.exerciseId,
          exerciseName: nameById.get(item.exerciseId) ?? null,
        };
        if (item.targetSets != null) entry.targetSets = item.targetSets;
        if (item.targetRepsLow != null) entry.targetRepsLow = item.targetRepsLow;
        if (item.targetRepsHigh != null) entry.targetRepsHigh = item.targetRepsHigh;
        if (item.targetRestSeconds != null) entry.targetRestSeconds = item.targetRestSeconds;
        if (item.targetDurationSeconds != null) {
          entry.targetDurationSeconds = item.targetDurationSeconds;
        }
        if (item.targetWeight != null) entry.targetWeight = Number(item.targetWeight);
        if (item.supersetGroup != null) entry.supersetGroup = item.supersetGroup;
        if (item.notes != null) entry.notes = item.notes;
        return entry;
      }),
    };
  });
}
