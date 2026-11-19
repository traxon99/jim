import {
  type OneOffLifetime,
  type ProgressionRule,
  formatTempo,
  oneOffFields,
  oneOffsReplacedBy,
  parseTempo,
  startedRoutineIds,
  uuidv7,
} from "@jim/core";
import { type DbOrTx, routineExercises, routines, sessions } from "@jim/db";
import { inArray, isNull, sql } from "drizzle-orm";
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
  /** Tempo (issue #845), "3-1-1" (down-pause-up, X = explosive lift); null, empty or absent = none. */
  tempo?: string | null;
}

/**
 * The tempo to store for one routine exercise: canonical "3-1-1", or null for
 * none. Throws a tool error naming the exercise when it isn't a tempo.
 */
export function routineTempo(
  tempo: string | null | undefined,
  exerciseName: string,
): string | null {
  if (tempo == null || tempo.trim() === "") return null;
  const parsed = parseTempo(tempo);
  if (!parsed) {
    throw new Error(
      `"${tempo}" isn't a tempo for ${exerciseName}. Use down-pause-up seconds like "3-1-1" (0–20 each, at least one above 0); only the last can be X for an explosive lift.`,
    );
  }
  return formatTempo(parsed);
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
  /** Makes it a one-off workout with this lifetime instead of a routine (issue #798). */
  oneOff?: OneOffLifetime;
  /** Preview only: run every check and return the result, then roll back (#245). */
  dryRun?: boolean;
}

export async function createRoutine(context: UserContext, input: CreateRoutineInput) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const now = new Date();
    const routineId = uuidv7();
    const warmup = input.warmup ? await findWarmupRoutine(tx, input.warmup) : null;
    const lifetime = input.oneOff ? oneOffFields(input.oneOff, now) : null;
    const replaced = input.oneOff ? await replaceOneOffs(tx, input.oneOff, now) : [];

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
      ...lifetime,
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
        tempo: routineTempo(item.tempo, exercise.name),
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
      ...(lifetime && {
        oneOff: {
          expiresAt: lifetime.oneOffExpiresAt?.toISOString() ?? null,
          day: lifetime.oneOffDay,
          replaced: replaced.map((r) => ({ id: r.id, name: r.name })),
        },
      }),
    };
  });
}

/**
 * A new 24h or until-done one-off replaces older unstarted ones of those
 * kinds (core `oneOffsReplacedBy`): they're tombstoned like a discard.
 */
async function replaceOneOffs(tx: DbOrTx, lifetime: OneOffLifetime, now: Date) {
  const live = await tx.select().from(routines).where(isNull(routines.deletedAt));
  const oneOffs = live.filter((routine) => routine.oneOff);
  if (oneOffs.length === 0) return [];
  const used = await tx
    .select({
      routineId: sessions.routineId,
      endedAt: sessions.endedAt,
      deletedAt: sessions.deletedAt,
    })
    .from(sessions)
    .where(
      inArray(
        sessions.routineId,
        oneOffs.map((routine) => routine.id),
      ),
    );
  const ids = new Set(oneOffsReplacedBy(lifetime, oneOffs, startedRoutineIds(used)));
  if (ids.size === 0) return [];
  await tx
    .update(routines)
    .set({
      deletedAt: now,
      updatedAt: now,
      deviceId: MCP_DEVICE_ID,
      serverSeq: sql`nextval('sync_seq')`,
    })
    .where(inArray(routines.id, [...ids]));
  return oneOffs.filter((routine) => ids.has(routine.id));
}
