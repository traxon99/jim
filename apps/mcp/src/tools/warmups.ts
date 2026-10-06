import { WARMUP_TEMPLATES, instantiateWarmupTemplate, uuidv7 } from "@jim/core";
import { exercises, routineExercises, routines } from "@jim/db";
import { eq, isNull, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser, withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";
import { findRoutine, nextRoutineIcon, nextRoutinePosition } from "./find-routine.js";
import { resolveExercise } from "./resolve-exercise.js";

/**
 * The built-in warm-up templates (issue #59) with their exercises spelled
 * out, so an agent can offer them by name before calling `create_warmup`.
 */
export async function listWarmupTemplates(context: UserContext) {
  return withUser(context, async (tx) => {
    const globals = await tx
      .select({ slug: exercises.slug, name: exercises.name })
      .from(exercises)
      .where(isNull(exercises.ownerId));
    const nameBySlug = new Map(globals.map((row) => [row.slug, row.name]));
    return WARMUP_TEMPLATES.map((template) => ({
      key: template.key,
      name: template.name,
      notes: template.notes,
      minutes: template.minutes,
      exercises: template.items.map((item) => ({
        exercise: nameBySlug.get(item.slug) ?? item.slug,
        sets: item.sets,
        ...(item.reps != null ? { reps: item.reps } : {}),
        ...(item.seconds != null ? { seconds: item.seconds } : {}),
      })),
    }));
  });
}

export interface WarmupExerciseInput {
  exercise: string;
  sets?: number;
  /** Reps per set; give this or `seconds`, matching how the exercise is logged. */
  reps?: number;
  /** Hold or work time per set, in seconds. */
  seconds?: number;
  notes?: string;
}

export interface CreateWarmupInput {
  /** A built-in template key from `list_warmup_templates`; omit to build a custom one. */
  template?: string;
  /** Required for a custom warm-up; defaults to the template's name. */
  name?: string;
  notes?: string;
  /** The warm-up timer's length; defaults to the template's. */
  minutes?: number;
  folder?: string;
  /** A custom warm-up's exercises, in order. Not allowed with `template`. */
  exercises?: WarmupExerciseInput[];
  /** Strength routines (ids or names) that should run this warm-up first. */
  attachTo?: string[];
  /** Preview only: run every check and return the result, then roll back (#245). */
  dryRun?: boolean;
}

/**
 * Creates a warm-up routine (`kind: "warmup"`), the same thing the phone
 * makes from Routines → New → Warm-up or by adding a built-in template: its
 * exercises run as the timed warm-up block before a linked routine, and it
 * never counts toward working volume. Optionally links it to strength
 * routines, as the routine form's Warm-up picker does.
 */
export async function createWarmup(context: UserContext, input: CreateWarmupInput) {
  const template =
    input.template === undefined
      ? null
      : WARMUP_TEMPLATES.find((candidate) => candidate.key === input.template);
  if (input.template !== undefined && !template) {
    throw new Error(
      `No warm-up template "${input.template}". Known keys: ${WARMUP_TEMPLATES.map((t) => t.key).join(", ")}.`,
    );
  }
  if (template && input.exercises?.length) {
    throw new Error("Pass either a template or a custom exercise list, not both.");
  }
  if (!template && !input.name) throw new Error("A custom warm-up needs a name.");
  if (!template && !input.exercises?.length) {
    throw new Error("A custom warm-up needs at least one exercise (or pass a template).");
  }

  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const now = new Date();
    const attachTargets = [];
    for (const key of input.attachTo ?? []) {
      const routine = await findRoutine(tx, key);
      if (routine.kind === "warmup") {
        throw new Error(`"${routine.name}" is itself a warm-up, so it can't have one attached.`);
      }
      attachTargets.push(routine);
    }

    type Item = {
      exerciseId: string;
      exerciseName: string;
      targetSets: number;
      targetRepsLow: number | null;
      targetRepsHigh: number | null;
      targetDurationSeconds: number | null;
      notes: string | null;
    };
    const items: Item[] = [];
    let missingExercises: string[] = [];
    let routineId = uuidv7();
    let name = input.name ?? "";
    let notes = input.notes ?? null;
    let minutes = input.minutes ?? null;

    if (template) {
      const globals = await tx
        .select({ id: exercises.id, slug: exercises.slug, name: exercises.name })
        .from(exercises)
        .where(isNull(exercises.ownerId));
      const instantiated = instantiateWarmupTemplate(
        template,
        new Map(globals.map((row) => [row.slug, row.id])),
        uuidv7,
      );
      const nameById = new Map(globals.map((row) => [row.id, row.name]));
      routineId = instantiated.routine.id;
      name = input.name ?? instantiated.routine.name;
      notes = input.notes ?? instantiated.routine.notes;
      minutes = input.minutes ?? instantiated.routine.warmupMinutes;
      missingExercises = instantiated.missingSlugs;
      for (const item of instantiated.items) {
        items.push({
          exerciseId: item.exerciseId,
          exerciseName: nameById.get(item.exerciseId) ?? item.exerciseId,
          targetSets: item.targetSets,
          targetRepsLow: item.targetRepsLow,
          targetRepsHigh: item.targetRepsHigh,
          targetDurationSeconds: item.targetDurationSeconds,
          notes: null,
        });
      }
    } else {
      for (const entry of input.exercises ?? []) {
        if (entry.reps != null && entry.seconds != null) {
          throw new Error(`${entry.exercise}: give reps or seconds, not both.`);
        }
        const exercise = await resolveExercise(tx, context.userId, entry.exercise);
        items.push({
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          targetSets: entry.sets ?? 1,
          targetRepsLow: entry.reps ?? null,
          targetRepsHigh: entry.reps ?? null,
          targetDurationSeconds: entry.seconds ?? null,
          notes: entry.notes ?? null,
        });
      }
    }

    await tx.insert(routines).values({
      id: routineId,
      userId: context.userId,
      name,
      notes,
      folder: input.folder ?? null,
      kind: "warmup",
      warmupMinutes: minutes,
      position: await nextRoutinePosition(tx),
      ...(await nextRoutineIcon(tx)),
      updatedAt: now,
      deviceId: MCP_DEVICE_ID,
    });

    for (const [position, item] of items.entries()) {
      await tx.insert(routineExercises).values({
        id: uuidv7(),
        userId: context.userId,
        routineId,
        exerciseId: item.exerciseId,
        position,
        targetSets: item.targetSets,
        targetRepsLow: item.targetRepsLow,
        targetRepsHigh: item.targetRepsHigh,
        targetDurationSeconds: item.targetDurationSeconds,
        notes: item.notes,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
      });
    }

    for (const routine of attachTargets) {
      await tx
        .update(routines)
        .set({
          warmupRoutineId: routineId,
          updatedAt: now,
          deviceId: MCP_DEVICE_ID,
          serverSeq: sql`nextval('sync_seq')`,
        })
        .where(eq(routines.id, routine.id));
    }

    return {
      id: routineId,
      name,
      kind: "warmup" as const,
      minutes,
      exercises: items.map((item) => ({
        exerciseId: item.exerciseId,
        exerciseName: item.exerciseName,
        sets: item.targetSets,
        ...(item.targetRepsLow != null ? { reps: item.targetRepsLow } : {}),
        ...(item.targetDurationSeconds != null ? { seconds: item.targetDurationSeconds } : {}),
      })),
      attachedTo: attachTargets.map((routine) => ({ id: routine.id, name: routine.name })),
      ...(missingExercises.length ? { missingExercises } : {}),
    };
  });
}
