import { parseInjuryRules, repointInjuryRules } from "@jim/core";
import {
  dprBlockLifts,
  exercises,
  injuries,
  personalRecords,
  routineExercises,
  sessionExercises,
  sessions,
} from "@jim/db";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";
import { ExerciseNotFoundError } from "./resolve-exercise.js";

export interface MergeExercisesInput {
  keepId: string;
  mergeId: string;
  /** Preview only: run every check and return the result, then roll back (#245). */
  dryRun?: boolean;
}

/**
 * Repoints every reference from `mergeId` to `keepId` (session_exercises,
 * routine_exercises, personal_records, PRP block lifts, injury exercise
 * rules) and archives `mergeId` rather than
 * deleting it — historical sets keep their referent either way, since
 * `sets` never references `exercises` directly, only through
 * `session_exercises` (S4's "archive rather than delete" pattern).
 */
export async function mergeExercises(context: UserContext, input: MergeExercisesInput) {
  if (input.keepId === input.mergeId) {
    throw new Error("keepId and mergeId must be different exercises");
  }

  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const [keep] = await tx.select().from(exercises).where(eq(exercises.id, input.keepId));
    if (!keep) throw new ExerciseNotFoundError(input.keepId);
    if (keep.isArchived) {
      throw new Error(`"${keep.name}" is archived, so it can't be the exercise to keep.`);
    }

    const [merge] = await tx.select().from(exercises).where(eq(exercises.id, input.mergeId));
    if (!merge) throw new ExerciseNotFoundError(input.mergeId);
    if (merge.ownerId !== context.userId) {
      throw new Error(
        "Only your own custom exercises can be merged away — this one is a global catalog entry.",
      );
    }
    // Sets carry weight×reps, a time or a distance by tracking type, so
    // merging across types would leave history the kept exercise can't show.
    if (merge.trackingType !== keep.trackingType) {
      throw new Error(
        `"${merge.name}" is tracked by ${merge.trackingType} and "${keep.name}" by ${keep.trackingType}, so they can't be merged.`,
      );
    }

    const now = new Date();

    // ADR-007: no tool may touch the phone's in-progress session. A session
    // exercise that belongs to one (endedAt IS NULL) is left untouched here
    // — it repoints on the *next* merge/edit once the phone finalizes it.
    const inProgressSessionIds = (
      await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(isNull(sessions.endedAt), isNull(sessions.deletedAt)))
    ).map((row) => row.id);

    const repointedSessionExercises = await tx
      .update(sessionExercises)
      .set({
        exerciseId: input.keepId,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(
        and(
          eq(sessionExercises.exerciseId, input.mergeId),
          inProgressSessionIds.length > 0
            ? notInArray(sessionExercises.sessionId, inProgressSessionIds)
            : undefined,
        ),
      )
      .returning({ id: sessionExercises.id });

    const repointedRoutineExercises = await tx
      .update(routineExercises)
      .set({
        exerciseId: input.keepId,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(routineExercises.exerciseId, input.mergeId))
      .returning({ id: routineExercises.id });

    const repointedPersonalRecords = await tx
      .update(personalRecords)
      .set({
        exerciseId: input.keepId,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(personalRecords.exerciseId, input.mergeId))
      .returning({ id: personalRecords.id });

    // A PRP block focused on the merged lift follows it to the kept one
    // (issue #497); if the block already has the kept lift, the duplicate
    // is removed instead.
    const mergeLifts = await tx
      .select()
      .from(dprBlockLifts)
      .where(and(eq(dprBlockLifts.exerciseId, input.mergeId), isNull(dprBlockLifts.deletedAt)));
    const blocksWithKeep = new Set(
      mergeLifts.length === 0
        ? []
        : (
            await tx
              .select({ blockId: dprBlockLifts.blockId })
              .from(dprBlockLifts)
              .where(
                and(
                  eq(dprBlockLifts.exerciseId, input.keepId),
                  isNull(dprBlockLifts.deletedAt),
                  inArray(
                    dprBlockLifts.blockId,
                    mergeLifts.map((lift) => lift.blockId),
                  ),
                ),
              )
          ).map((row) => row.blockId),
    );
    let repointedBlockLifts = 0;
    for (const lift of mergeLifts) {
      const duplicate = blocksWithKeep.has(lift.blockId);
      await tx
        .update(dprBlockLifts)
        .set({
          ...(duplicate ? { deletedAt: now } : { exerciseId: input.keepId }),
          updatedAt: now,
          deviceId: MCP_DEVICE_ID,
          serverSeq: sql`nextval('sync_seq')`,
        })
        .where(eq(dprBlockLifts.id, lift.id));
      if (!duplicate) {
        repointedBlockLifts += 1;
        blocksWithKeep.add(lift.blockId);
      }
    }

    // Injury exercise rules (issue #724) name exercises inside JSON.
    let repointedInjuryRules = 0;
    const injuryRows = await tx.select().from(injuries).where(isNull(injuries.deletedAt));
    for (const injury of injuryRows) {
      const rules = repointInjuryRules(
        parseInjuryRules(injury.exerciseRules),
        input.mergeId,
        input.keepId,
      );
      if (!rules) continue;
      await tx
        .update(injuries)
        .set({
          exerciseRules: rules,
          updatedAt: now,
          deviceId: MCP_DEVICE_ID,
          serverSeq: sql`nextval('sync_seq')`,
        })
        .where(eq(injuries.id, injury.id));
      repointedInjuryRules += 1;
    }

    await tx
      .update(exercises)
      .set({
        isArchived: true,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(exercises.id, input.mergeId));

    return {
      keepId: input.keepId,
      mergeId: input.mergeId,
      repointedSessionExercises: repointedSessionExercises.length,
      repointedRoutineExercises: repointedRoutineExercises.length,
      repointedPersonalRecords: repointedPersonalRecords.length,
      repointedBlockLifts,
      repointedInjuryRules,
      archived: { id: merge.id, name: merge.name },
    };
  });
}
