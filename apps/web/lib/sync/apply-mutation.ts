import { type Mutation, SYNC_DATE_FIELDS, normalizeDates } from "@jim/core";
import {
  type DbOrTx,
  bodyMeasurements,
  dprBlockLifts,
  dprBlocks,
  exercises,
  personalRecords,
  programRoutines,
  programs,
  routineExercises,
  routines,
  sessionExercises,
  sessions,
  sets,
  syncMutations,
} from "@jim/db";
import { type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { excluded } from "./excluded";

export type ApplyResult = "applied" | "duplicate" | "error";

/** (updatedAt, deviceId) tie-break per ADR-003 — the SQL mirror of @jim/core's isNewerWrite. */
function lwwGuard(updatedAt: PgColumn, deviceId: PgColumn): SQL {
  return sql`(${excluded(updatedAt)}, ${excluded(deviceId)}) > (${updatedAt}, ${deviceId})`;
}

/**
 * Applies one outbox mutation inside its own SAVEPOINT (nested transaction),
 * so a bad mutation can't poison the rest of the push batch: Postgres aborts
 * an entire transaction after any single statement error, so without a
 * SAVEPOINT one failure would take down every mutation after it.
 *
 * The sync_mutations insert and the entity write happen in the same
 * SAVEPOINT, so "recorded as applied" and "actually applied" can never
 * diverge — a crash between the two just rolls both back.
 */
export async function applyMutation(
  tx: DbOrTx,
  userId: string,
  mutation: Mutation,
): Promise<ApplyResult> {
  try {
    return await tx.transaction(async (savepoint) => {
      const [ledgerRow] = await savepoint
        .insert(syncMutations)
        .values({ id: mutation.id, userId })
        .onConflictDoNothing()
        .returning({ id: syncMutations.id });

      if (!ledgerRow) {
        return "duplicate"; // a previous push already applied this mutation_id
      }

      await applyEntity(savepoint, userId, mutation);
      return "applied";
    });
  } catch (error) {
    console.error(`[sync/push] mutation ${mutation.id} (${mutation.table}) failed:`, error);
    return "error";
  }
}

async function applyEntity(tx: DbOrTx, userId: string, mutation: Mutation): Promise<void> {
  const entity = mutation.entity;

  switch (mutation.table) {
    case "sets": {
      // Append-only (ADR-003): no conflict handling, no update path at all.
      const dated = normalizeDates(entity as typeof sets.$inferInsert, SYNC_DATE_FIELDS.sets);
      const { serverSeq: _serverSeq, ...row } = dated;
      await tx.insert(sets).values({ ...row, userId });
      return;
    }

    case "routines": {
      // createdAt is kept (not stripped): a routine created offline should
      // keep the time it was actually created, not when it happened to
      // reach the server. It's simply never in the onConflictDoUpdate set
      // below, so an edit can't move it either.
      const dated = normalizeDates(
        entity as typeof routines.$inferInsert,
        SYNC_DATE_FIELDS.routines,
      );
      const { serverSeq: _serverSeq, ...row } = dated;
      await tx
        .insert(routines)
        .values({ ...row, userId })
        .onConflictDoUpdate({
          target: routines.id,
          set: {
            name: excluded(routines.name),
            notes: excluded(routines.notes),
            position: excluded(routines.position),
            folder: excluded(routines.folder),
            kind: excluded(routines.kind),
            warmupRoutineId: excluded(routines.warmupRoutineId),
            warmupMinutes: excluded(routines.warmupMinutes),
            iconShape: excluded(routines.iconShape),
            iconColor: excluded(routines.iconColor),
            updatedAt: excluded(routines.updatedAt),
            deviceId: excluded(routines.deviceId),
            deletedAt: excluded(routines.deletedAt),
            serverSeq: sql`nextval('sync_seq')`,
          },
          setWhere: lwwGuard(routines.updatedAt, routines.deviceId),
        });
      return;
    }

    case "routineExercises": {
      const dated = normalizeDates(
        entity as typeof routineExercises.$inferInsert,
        SYNC_DATE_FIELDS.routineExercises,
      );
      const { serverSeq: _serverSeq, ...row } = dated;
      await tx
        .insert(routineExercises)
        .values({ ...row, userId })
        .onConflictDoUpdate({
          target: routineExercises.id,
          set: {
            routineId: excluded(routineExercises.routineId),
            exerciseId: excluded(routineExercises.exerciseId),
            position: excluded(routineExercises.position),
            supersetGroup: excluded(routineExercises.supersetGroup),
            targetSets: excluded(routineExercises.targetSets),
            targetRepsLow: excluded(routineExercises.targetRepsLow),
            targetRepsHigh: excluded(routineExercises.targetRepsHigh),
            targetRestSeconds: excluded(routineExercises.targetRestSeconds),
            targetDurationSeconds: excluded(routineExercises.targetDurationSeconds),
            targetWeight: excluded(routineExercises.targetWeight),
            notes: excluded(routineExercises.notes),
            updatedAt: excluded(routineExercises.updatedAt),
            deviceId: excluded(routineExercises.deviceId),
            deletedAt: excluded(routineExercises.deletedAt),
            serverSeq: sql`nextval('sync_seq')`,
          },
          setWhere: lwwGuard(routineExercises.updatedAt, routineExercises.deviceId),
        });
      return;
    }

    case "sessions": {
      const dated = normalizeDates(
        entity as typeof sessions.$inferInsert,
        SYNC_DATE_FIELDS.sessions,
      );
      // startedAt, like routines.createdAt, is kept for the insert path and
      // simply absent from the update set below.
      const { serverSeq: _serverSeq, ...row } = dated;
      await tx
        .insert(sessions)
        .values({ ...row, userId })
        .onConflictDoUpdate({
          target: sessions.id,
          set: {
            routineId: excluded(sessions.routineId),
            name: excluded(sessions.name),
            endedAt: excluded(sessions.endedAt),
            notes: excluded(sessions.notes),
            bodyweight: excluded(sessions.bodyweight),
            updatedAt: excluded(sessions.updatedAt),
            deviceId: excluded(sessions.deviceId),
            deletedAt: excluded(sessions.deletedAt),
            serverSeq: sql`nextval('sync_seq')`,
          },
          setWhere: lwwGuard(sessions.updatedAt, sessions.deviceId),
        });
      return;
    }

    case "sessionExercises": {
      const dated = normalizeDates(
        entity as typeof sessionExercises.$inferInsert,
        SYNC_DATE_FIELDS.sessionExercises,
      );
      const { serverSeq: _serverSeq, ...row } = dated;
      await tx
        .insert(sessionExercises)
        .values({ ...row, userId })
        .onConflictDoUpdate({
          target: sessionExercises.id,
          set: {
            sessionId: excluded(sessionExercises.sessionId),
            exerciseId: excluded(sessionExercises.exerciseId),
            position: excluded(sessionExercises.position),
            supersetGroup: excluded(sessionExercises.supersetGroup),
            notes: excluded(sessionExercises.notes),
            stickyNote: excluded(sessionExercises.stickyNote),
            restSeconds: excluded(sessionExercises.restSeconds),
            warmupSets: excluded(sessionExercises.warmupSets),
            updatedAt: excluded(sessionExercises.updatedAt),
            deviceId: excluded(sessionExercises.deviceId),
            deletedAt: excluded(sessionExercises.deletedAt),
            serverSeq: sql`nextval('sync_seq')`,
          },
          setWhere: lwwGuard(sessionExercises.updatedAt, sessionExercises.deviceId),
        });
      return;
    }

    case "personalRecords": {
      const dated = normalizeDates(
        entity as typeof personalRecords.$inferInsert,
        SYNC_DATE_FIELDS.personalRecords,
      );
      const { serverSeq: _serverSeq, ...row } = dated;
      await tx
        .insert(personalRecords)
        .values({ ...row, userId })
        .onConflictDoUpdate({
          target: personalRecords.id,
          set: {
            exerciseId: excluded(personalRecords.exerciseId),
            kind: excluded(personalRecords.kind),
            value: excluded(personalRecords.value),
            setId: excluded(personalRecords.setId),
            achievedAt: excluded(personalRecords.achievedAt),
            updatedAt: excluded(personalRecords.updatedAt),
            deviceId: excluded(personalRecords.deviceId),
            deletedAt: excluded(personalRecords.deletedAt),
            serverSeq: sql`nextval('sync_seq')`,
          },
          setWhere: lwwGuard(personalRecords.updatedAt, personalRecords.deviceId),
        });
      return;
    }

    case "bodyMeasurements": {
      const dated = normalizeDates(
        entity as typeof bodyMeasurements.$inferInsert,
        SYNC_DATE_FIELDS.bodyMeasurements,
      );
      const { serverSeq: _serverSeq, ...row } = dated;
      await tx
        .insert(bodyMeasurements)
        .values({ ...row, userId })
        .onConflictDoUpdate({
          target: bodyMeasurements.id,
          set: {
            kind: excluded(bodyMeasurements.kind),
            value: excluded(bodyMeasurements.value),
            unit: excluded(bodyMeasurements.unit),
            measuredAt: excluded(bodyMeasurements.measuredAt),
            updatedAt: excluded(bodyMeasurements.updatedAt),
            deviceId: excluded(bodyMeasurements.deviceId),
            deletedAt: excluded(bodyMeasurements.deletedAt),
            serverSeq: sql`nextval('sync_seq')`,
          },
          setWhere: lwwGuard(bodyMeasurements.updatedAt, bodyMeasurements.deviceId),
        });
      return;
    }

    case "exercises": {
      // ownerId is forced to the verified user below regardless of what the
      // payload carries — RLS's owner_id = auth.uid() check would reject an
      // insert/update against anyone else's row (or a global one) anyway,
      // but this keeps a mismatched payload from ever reaching that check
      // as a no-op-looking failure instead of applying as the right owner.
      const dated = normalizeDates(
        entity as typeof exercises.$inferInsert,
        SYNC_DATE_FIELDS.exercises,
      );
      const { serverSeq: _serverSeq, ownerId: _ownerId, ...row } = dated;
      await tx
        .insert(exercises)
        .values({ ...row, ownerId: userId })
        .onConflictDoUpdate({
          target: exercises.id,
          set: {
            slug: excluded(exercises.slug),
            name: excluded(exercises.name),
            aliases: excluded(exercises.aliases),
            primaryMuscles: excluded(exercises.primaryMuscles),
            secondaryMuscles: excluded(exercises.secondaryMuscles),
            equipment: excluded(exercises.equipment),
            mechanic: excluded(exercises.mechanic),
            force: excluded(exercises.force),
            level: excluded(exercises.level),
            trackingType: excluded(exercises.trackingType),
            category: excluded(exercises.category),
            instructions: excluded(exercises.instructions),
            imageUrls: excluded(exercises.imageUrls),
            isArchived: excluded(exercises.isArchived),
            updatedAt: excluded(exercises.updatedAt),
            deviceId: excluded(exercises.deviceId),
            serverSeq: sql`nextval('sync_seq')`,
          },
          setWhere: lwwGuard(exercises.updatedAt, exercises.deviceId),
        });
      return;
    }

    case "programs": {
      // createdAt kept on insert, absent from the update set (as routines).
      const dated = normalizeDates(
        entity as typeof programs.$inferInsert,
        SYNC_DATE_FIELDS.programs,
      );
      const { serverSeq: _serverSeq, ...row } = dated;
      await tx
        .insert(programs)
        .values({ ...row, userId })
        .onConflictDoUpdate({
          target: programs.id,
          set: {
            name: excluded(programs.name),
            mode: excluded(programs.mode),
            isActive: excluded(programs.isActive),
            notes: excluded(programs.notes),
            position: excluded(programs.position),
            durationWeeks: excluded(programs.durationWeeks),
            activatedAt: excluded(programs.activatedAt),
            updatedAt: excluded(programs.updatedAt),
            deviceId: excluded(programs.deviceId),
            deletedAt: excluded(programs.deletedAt),
            serverSeq: sql`nextval('sync_seq')`,
          },
          setWhere: lwwGuard(programs.updatedAt, programs.deviceId),
        });
      return;
    }

    case "programRoutines": {
      const dated = normalizeDates(
        entity as typeof programRoutines.$inferInsert,
        SYNC_DATE_FIELDS.programRoutines,
      );
      const { serverSeq: _serverSeq, ...row } = dated;
      await tx
        .insert(programRoutines)
        .values({ ...row, userId })
        .onConflictDoUpdate({
          target: programRoutines.id,
          set: {
            programId: excluded(programRoutines.programId),
            routineId: excluded(programRoutines.routineId),
            position: excluded(programRoutines.position),
            weekday: excluded(programRoutines.weekday),
            updatedAt: excluded(programRoutines.updatedAt),
            deviceId: excluded(programRoutines.deviceId),
            deletedAt: excluded(programRoutines.deletedAt),
            serverSeq: sql`nextval('sync_seq')`,
          },
          setWhere: lwwGuard(programRoutines.updatedAt, programRoutines.deviceId),
        });
      return;
    }

    case "dprBlocks": {
      // createdAt kept on insert, absent from the update set (as programs).
      const dated = normalizeDates(
        entity as typeof dprBlocks.$inferInsert,
        SYNC_DATE_FIELDS.dprBlocks,
      );
      const { serverSeq: _serverSeq, ...row } = dated;
      await tx
        .insert(dprBlocks)
        .values({ ...row, userId })
        .onConflictDoUpdate({
          target: dprBlocks.id,
          set: {
            startedAt: excluded(dprBlocks.startedAt),
            weeks: excluded(dprBlocks.weeks),
            endsAt: excluded(dprBlocks.endsAt),
            status: excluded(dprBlocks.status),
            aggressiveness: excluded(dprBlocks.aggressiveness),
            experience: excluded(dprBlocks.experience),
            programId: excluded(dprBlocks.programId),
            updatedAt: excluded(dprBlocks.updatedAt),
            deviceId: excluded(dprBlocks.deviceId),
            deletedAt: excluded(dprBlocks.deletedAt),
            serverSeq: sql`nextval('sync_seq')`,
          },
          setWhere: lwwGuard(dprBlocks.updatedAt, dprBlocks.deviceId),
        });
      return;
    }

    case "dprBlockLifts": {
      const dated = normalizeDates(
        entity as typeof dprBlockLifts.$inferInsert,
        SYNC_DATE_FIELDS.dprBlockLifts,
      );
      const { serverSeq: _serverSeq, ...row } = dated;
      await tx
        .insert(dprBlockLifts)
        .values({ ...row, userId })
        .onConflictDoUpdate({
          target: dprBlockLifts.id,
          set: {
            blockId: excluded(dprBlockLifts.blockId),
            exerciseId: excluded(dprBlockLifts.exerciseId),
            position: excluded(dprBlockLifts.position),
            baselineE1rm: excluded(dprBlockLifts.baselineE1rm),
            goalE1rm: excluded(dprBlockLifts.goalE1rm),
            updatedAt: excluded(dprBlockLifts.updatedAt),
            deviceId: excluded(dprBlockLifts.deviceId),
            deletedAt: excluded(dprBlockLifts.deletedAt),
            serverSeq: sql`nextval('sync_seq')`,
          },
          setWhere: lwwGuard(dprBlockLifts.updatedAt, dprBlockLifts.deviceId),
        });
      return;
    }
  }
}
