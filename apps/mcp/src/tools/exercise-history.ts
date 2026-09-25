import { deletedSessionExerciseIds, estimatedOneRepMaxSeries, resolveCurrentRows } from "@jim/core";
import { sessionExercises, sessions, sets } from "@jim/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";
import { resolveExercise } from "./resolve-exercise.js";

export interface ExerciseHistoryInput {
  exercise: string;
  from?: string;
  to?: string;
}

export async function exerciseHistory(context: UserContext, input: ExerciseHistoryInput) {
  return withUser(context, async (tx) => {
    const exercise = await resolveExercise(tx, context.userId, input.exercise);

    const liveExerciseRows = await tx
      .select()
      .from(sessionExercises)
      .where(and(eq(sessionExercises.exerciseId, exercise.id), isNull(sessionExercises.deletedAt)));
    // Leave out sets from deleted workouts (issue #200).
    const sessionIds = [...new Set(liveExerciseRows.map((row) => row.sessionId))];
    const sessionRows = sessionIds.length
      ? await tx
          .select({ id: sessions.id, deletedAt: sessions.deletedAt })
          .from(sessions)
          .where(inArray(sessions.id, sessionIds))
      : [];
    const deleted = deletedSessionExerciseIds(sessionRows, liveExerciseRows);
    const exerciseRows = liveExerciseRows.filter((row) => !deleted.has(row.id));
    const sessionExerciseIds = exerciseRows.map((row) => row.id);
    if (sessionExerciseIds.length === 0) {
      return {
        exercise: { id: exercise.id, name: exercise.name },
        sets: [],
        estimatedOneRepMaxSeries: [],
      };
    }

    const sessionIdBySessionExercise = new Map(exerciseRows.map((row) => [row.id, row.sessionId]));

    // Fetch every version of every set for this exercise (including
    // tombstoned/superseded rows) so resolveCurrentRows can see full
    // supersede chains, then filter to current, non-deleted, in-range sets.
    const allSets = resolveCurrentRows(
      await tx.select().from(sets).where(inArray(sets.sessionExerciseId, sessionExerciseIds)),
    );
    const filtered = allSets
      .filter((set) => !set.deletedAt)
      .filter((set) => (input.from ? set.completedAt >= new Date(input.from) : true))
      .filter((set) => (input.to ? set.completedAt <= new Date(input.to) : true))
      .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

    const series = estimatedOneRepMaxSeries(
      filtered.map((set) => ({
        sessionId: sessionIdBySessionExercise.get(set.sessionExerciseId) ?? "",
        completedAt: set.completedAt,
        weight: set.weight == null ? null : Number(set.weight),
        reps: set.reps,
      })),
    );

    return {
      exercise: { id: exercise.id, name: exercise.name },
      sets: filtered.map((set) => ({
        id: set.id,
        sessionId: sessionIdBySessionExercise.get(set.sessionExerciseId) ?? null,
        kind: set.kind,
        weight: set.weight == null ? null : Number(set.weight),
        reps: set.reps,
        completedAt: set.completedAt.toISOString(),
      })),
      estimatedOneRepMaxSeries: series.map((point) => ({
        date: point.date.toISOString(),
        sessionId: point.sessionId,
        estimatedOneRepMax: point.estimatedOneRepMax,
      })),
    };
  });
}
