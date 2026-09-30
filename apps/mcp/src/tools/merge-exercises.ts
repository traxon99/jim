import { exercises, personalRecords, routineExercises, sessionExercises, sessions } from "@jim/db";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
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
 * routine_exercises, personal_records) and archives `mergeId` rather than
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

    const [merge] = await tx.select().from(exercises).where(eq(exercises.id, input.mergeId));
    if (!merge) throw new ExerciseNotFoundError(input.mergeId);
    if (merge.ownerId !== context.userId) {
      throw new Error(
        "Only your own custom exercises can be merged away — this one is a global catalog entry.",
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
      archived: { id: merge.id, name: merge.name },
    };
  });
}
