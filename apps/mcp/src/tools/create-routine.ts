import { type ProgressionRule, uuidv7 } from "@jim/core";
import { routineExercises, routines } from "@jim/db";
import type { UserContext } from "../context.js";
import { withUserWrite } from "../context.js";
import { findWarmupRoutine, nextRoutineIcon } from "./find-routine.js";
import { progressionRuleChecker } from "./progression-rules.js";
import { resolveExercise } from "./resolve-exercise.js";

/** Distinguishes MCP-authored rows in `device_id` the same way the phone stamps its own device id. */
export const MCP_DEVICE_ID = "mcp-server";

export interface CreateRoutineExerciseInput {
  exercise: string;
  targetSets?: number;
  targetRepsLow?: number;
  targetRepsHigh?: number;
  targetRestSeconds?: number;
  targetDurationSeconds?: number;
  targetWeight?: number;
  supersetGroup?: number;
  notes?: string;
  /** A custom progression rule (issue #255); null or absent = none. */
  progression?: ProgressionRule | null;
}

export interface CreateRoutineInput {
  name: string;
  folder?: string;
  notes?: string;
  /** A warm-up routine (id or name) to run before this one, like the routine form's Warm-up picker. */
  warmup?: string;
  /** The warm-up timer's length for this routine; defaults to the warm-up's own. */
  warmupMinutes?: number;
  exercises: CreateRoutineExerciseInput[];
  /** Preview only: run every check and return the result, then roll back (#245). */
  dryRun?: boolean;
}

export async function createRoutine(context: UserContext, input: CreateRoutineInput) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const now = new Date();
    const routineId = uuidv7();
    const warmup = input.warmup ? await findWarmupRoutine(tx, input.warmup) : null;

    await tx.insert(routines).values({
      id: routineId,
      userId: context.userId,
      name: input.name,
      folder: input.folder ?? null,
      notes: input.notes ?? null,
      kind: "strength",
      warmupRoutineId: warmup?.id ?? null,
      warmupMinutes: input.warmupMinutes ?? null,
      ...(await nextRoutineIcon(tx)),
      position: 0,
      updatedAt: now,
      deviceId: MCP_DEVICE_ID,
    });

    const checkRule = progressionRuleChecker(tx, context.userId);
    const items = [];
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

    return {
      id: routineId,
      name: input.name,
      warmup: warmup ? { id: warmup.id, name: warmup.name } : null,
      exercises: items,
    };
  });
}
