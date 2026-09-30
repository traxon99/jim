import { uuidv7 } from "@jim/core";
import { routineExercises, routines } from "@jim/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";
import type { CreateRoutineExerciseInput } from "./create-routine.js";
import { resolveExercise } from "./resolve-exercise.js";

export class RoutineNotFoundError extends Error {
  constructor(routineId: string) {
    super(`No routine found with id ${routineId}.`);
  }
}

export interface UpdateRoutineInput {
  routineId: string;
  name?: string;
  folder?: string | null;
  notes?: string | null;
  /** When provided, replaces the routine's entire exercise list (existing rows are tombstoned, not diffed). */
  exercises?: CreateRoutineExerciseInput[];
  /** Preview only: run every check and return the result, then roll back (#245). */
  dryRun?: boolean;
}

export async function updateRoutine(context: UserContext, input: UpdateRoutineInput) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const [existing] = await tx.select().from(routines).where(eq(routines.id, input.routineId));
    if (!existing || existing.deletedAt) throw new RoutineNotFoundError(input.routineId);

    const now = new Date();
    await tx
      .update(routines)
      .set({
        name: input.name ?? existing.name,
        folder: input.folder === undefined ? existing.folder : input.folder,
        notes: input.notes === undefined ? existing.notes : input.notes,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(routines.id, input.routineId));

    let items: Array<{ id: string; exerciseId: string; exerciseName: string }> | undefined;
    let removedExercises: number | undefined;
    if (input.exercises) {
      const removed = await tx
        .update(routineExercises)
        .set({
          deletedAt: now,
          updatedAt: now,
          deviceId: MCP_DEVICE_ID,
          serverSeq: sql`nextval('sync_seq')`,
        })
        .where(
          and(eq(routineExercises.routineId, input.routineId), isNull(routineExercises.deletedAt)),
        )
        .returning({ id: routineExercises.id });
      removedExercises = removed.length;

      items = [];
      for (const [index, item] of input.exercises.entries()) {
        const exercise = await resolveExercise(tx, context.userId, item.exercise);
        const id = uuidv7();
        await tx.insert(routineExercises).values({
          id,
          userId: context.userId,
          routineId: input.routineId,
          exerciseId: exercise.id,
          position: index,
          supersetGroup: item.supersetGroup ?? null,
          targetSets: item.targetSets ?? null,
          targetRepsLow: item.targetRepsLow ?? null,
          targetRepsHigh: item.targetRepsHigh ?? null,
          targetRestSeconds: item.targetRestSeconds ?? null,
          notes: item.notes ?? null,
          updatedAt: now,
          deviceId: MCP_DEVICE_ID,
        });
        items.push({ id, exerciseId: exercise.id, exerciseName: exercise.name });
      }
    }

    return {
      id: input.routineId,
      name: input.name ?? existing.name,
      folder: input.folder === undefined ? existing.folder : input.folder,
      notes: input.notes === undefined ? existing.notes : input.notes,
      exercises: items,
      removedExercises,
    };
  });
}
