import {
  deletedSessionExerciseIds,
  estimatedOneRepMaxSeries,
  isShortRest,
  predictOneRepMax,
  predictedOneRepMaxSeries,
  resolveCurrentRows,
  restStats,
  workStats,
} from "@jim/core";
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
        rest: restStats([]),
        setTime: workStats([]),
        estimatedOneRepMaxSeries: [],
        predictedOneRepMax: null,
        predictedOneRepMaxSeries: [],
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

    // The prediction (issue #713) reads every set up to `to`, not just the
    // window: a lift's level depends on the weeks before `from` too.
    const asOf = input.to ? new Date(input.to) : new Date();
    const predictionSets = allSets
      .filter((set) => !set.deletedAt && set.completedAt <= asOf)
      .map((set) => ({
        sessionId: sessionIdBySessionExercise.get(set.sessionExerciseId) ?? "",
        completedAt: set.completedAt,
        weight: set.weight == null ? null : Number(set.weight),
        reps: set.reps,
        rpe: set.rpe == null ? null : Number(set.rpe),
        kind: set.kind,
      }));
    const prediction = predictOneRepMax(predictionSets, asOf);
    const fromDate = input.from ? new Date(input.from) : null;
    const predictedSeries = predictedOneRepMaxSeries(predictionSets).filter(
      (point) => !fromDate || point.date >= fromDate,
    );

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
        rpe: set.rpe == null ? null : Number(set.rpe),
        restSeconds: set.restSeconds,
        restTargetSeconds: set.restTargetSeconds,
        shortRest: isShortRest(set.restSeconds, set.restTargetSeconds),
        workSeconds: set.workSeconds,
        completedAt: set.completedAt.toISOString(),
      })),
      // Rest compliance across these sets (issue #233).
      rest: restStats(filtered),
      // Set times from the working set timer (issue #634).
      setTime: workStats(filtered),
      estimatedOneRepMaxSeries: series.map((point) => ({
        date: point.date.toISOString(),
        sessionId: point.sessionId,
        estimatedOneRepMax: point.estimatedOneRepMax,
      })),
      // Where the lift's 1RM likely is at `to` (or now), from RPE, reps, recent
      // PRs, recency and trend; the series above stays the per-session estimate.
      predictedOneRepMax: prediction,
      predictedOneRepMaxSeries: predictedSeries.map((point) => ({
        date: point.date.toISOString(),
        sessionId: point.sessionId,
        predictedOneRepMax: point.predictedOneRepMax,
      })),
    };
  });
}
