import { uuidv7 } from "@jim/core";
import { routineExercises, routines } from "@jim/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";
import type { CreateRoutineExerciseInput } from "./create-routine.js";
import { findRoutine, findWarmupRoutine } from "./find-routine.js";
import { progressionRuleChecker } from "./progression-rules.js";
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
  /** A warm-up routine (id or name) to run before this one; null unlinks it. Strength routines only. */
  warmup?: string | null;
  /** The warm-up timer's length in minutes; null clears it. */
  warmupMinutes?: number | null;
  /** When provided, replaces the routine's entire exercise list (existing rows are tombstoned, not diffed). */
  exercises?: CreateRoutineExerciseInput[];
  /** Preview only: run every check and return the result, then roll back (#245). */
  dryRun?: boolean;
}

export async function updateRoutine(context: UserContext, input: UpdateRoutineInput) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const existing = await findRoutine(tx, input.routineId);
    const routineId = existing.id;
    let warmupRoutineId = existing.warmupRoutineId;
    if (input.warmup !== undefined) {
      if (input.warmup !== null && existing.kind === "warmup") {
        throw new Error(
          `"${existing.name}" is itself a warm-up, so it can't have a warm-up linked to it.`,
        );
      }
      warmupRoutineId =
        input.warmup === null ? null : (await findWarmupRoutine(tx, input.warmup)).id;
    }

    const now = new Date();
    await tx
      .update(routines)
      .set({
        name: input.name ?? existing.name,
        folder: input.folder === undefined ? existing.folder : input.folder,
        notes: input.notes === undefined ? existing.notes : input.notes,
        warmupRoutineId,
        warmupMinutes:
          input.warmupMinutes === undefined ? existing.warmupMinutes : input.warmupMinutes,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(routines.id, routineId));

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
        .where(and(eq(routineExercises.routineId, routineId), isNull(routineExercises.deletedAt)))
        .returning({ id: routineExercises.id });
      removedExercises = removed.length;

      const checkRule = progressionRuleChecker(tx, context.userId);
      items = [];
      for (const [index, item] of input.exercises.entries()) {
        const exercise = await resolveExercise(tx, context.userId, item.exercise);
        const progressionRule = await checkRule(item.progression, exercise);
        const id = uuidv7();
        await tx.insert(routineExercises).values({
          id,
          userId: context.userId,
          routineId,
          exerciseId: exercise.id,
          position: index,
          supersetGroup: item.supersetGroup ?? null,
          targetSets: item.targetSets ?? null,
          targetRepsLow: item.targetRepsLow ?? null,
          targetRepsHigh: item.targetRepsHigh ?? null,
          targetRestSeconds: item.targetRestSeconds ?? null,
          targetDurationSeconds: item.targetDurationSeconds ?? null,
          targetWeight: item.targetWeight == null ? null : String(item.targetWeight),
          progressionRule,
          notes: item.notes ?? null,
          updatedAt: now,
          deviceId: MCP_DEVICE_ID,
        });
        items.push({ id, exerciseId: exercise.id, exerciseName: exercise.name });
      }
    }

    return {
      id: routineId,
      name: input.name ?? existing.name,
      folder: input.folder === undefined ? existing.folder : input.folder,
      notes: input.notes === undefined ? existing.notes : input.notes,
      warmupRoutineId,
      exercises: items,
      removedExercises,
    };
  });
}
