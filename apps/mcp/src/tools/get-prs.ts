import {
  type PersonalRecordEntry,
  type PrKind,
  currentPersonalRecords,
  deletedSessionExerciseIds,
  withoutDeletedSessionRecords,
} from "@jim/core";
import { type DbOrTx, exercises, personalRecords, sessionExercises, sessions, sets } from "@jim/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";
import { resolveExercise } from "./resolve-exercise.js";

export interface GetPrsInput {
  exercise?: string;
  kind?: PrKind;
}

/**
 * Leaves out PRs set in a deleted workout, or on an exercise removed from
 * one (issue #200): deleting a workout only tombstones its session, so its
 * personal_records rows are still there.
 */
async function withoutDeletedSessions<T extends { setId: string | null }>(
  tx: DbOrTx,
  rows: readonly T[],
): Promise<T[]> {
  const setIds = [...new Set(rows.flatMap((row) => (row.setId ? [row.setId] : [])))];
  if (setIds.length === 0) return [...rows];

  const setRows = await tx
    .select({ id: sets.id, sessionExerciseId: sets.sessionExerciseId })
    .from(sets)
    .where(inArray(sets.id, setIds));
  const sessionExerciseIds = [...new Set(setRows.map((set) => set.sessionExerciseId))];
  if (sessionExerciseIds.length === 0) return [...rows];

  const sessionExerciseRows = await tx
    .select({
      id: sessionExercises.id,
      sessionId: sessionExercises.sessionId,
      deletedAt: sessionExercises.deletedAt,
    })
    .from(sessionExercises)
    .where(inArray(sessionExercises.id, sessionExerciseIds));
  const sessionIds = [...new Set(sessionExerciseRows.map((row) => row.sessionId))];
  const sessionRows = sessionIds.length
    ? await tx
        .select({ id: sessions.id, deletedAt: sessions.deletedAt })
        .from(sessions)
        .where(inArray(sessions.id, sessionIds))
    : [];

  return withoutDeletedSessionRecords(
    rows,
    setRows,
    deletedSessionExerciseIds(sessionRows, sessionExerciseRows),
  );
}

export async function getPrs(context: UserContext, input: GetPrsInput) {
  return withUser(context, async (tx) => {
    const conditions = [isNull(personalRecords.deletedAt)];

    if (input.exercise) {
      const exercise = await resolveExercise(tx, context.userId, input.exercise);
      conditions.push(eq(personalRecords.exerciseId, exercise.id));
    }
    if (input.kind) conditions.push(eq(personalRecords.kind, input.kind));

    const rows = await withoutDeletedSessions(
      tx,
      await tx
        .select()
        .from(personalRecords)
        .where(and(...conditions)),
    );

    const entries: PersonalRecordEntry[] = rows.map((row) => ({
      id: row.id,
      exerciseId: row.exerciseId,
      kind: row.kind,
      value: Number(row.value),
      achievedAt: row.achievedAt,
    }));
    const current = currentPersonalRecords(entries);

    const exerciseIds = [...new Set(current.map((pr) => pr.exerciseId))];
    const exerciseNames = exerciseIds.length
      ? new Map(
          (await tx.select().from(exercises).where(inArray(exercises.id, exerciseIds))).map((e) => [
            e.id,
            e.name,
          ]),
        )
      : new Map<string, string>();

    return current
      .sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime())
      .map((pr) => ({
        exerciseId: pr.exerciseId,
        exerciseName: exerciseNames.get(pr.exerciseId) ?? "Unknown exercise",
        kind: pr.kind,
        value: pr.value,
        achievedAt: pr.achievedAt.toISOString(),
      }));
  });
}
