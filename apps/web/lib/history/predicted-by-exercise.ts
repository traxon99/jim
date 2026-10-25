import {
  type PredictedOneRepMax,
  type PredictionSet,
  deletedSessionExerciseIds,
  predictOneRepMaxNow,
  resolveCurrentRows,
} from "@jim/core";

interface SessionRowLike {
  id: string;
  deletedAt: Date | null;
}

interface SessionExerciseRowLike {
  id: string;
  sessionId: string;
  exerciseId: string;
  deletedAt: Date | null;
}

interface SetRowLike {
  id: string;
  sessionExerciseId: string;
  supersedesId: string | null;
  deletedAt: Date | null;
  completedAt: Date;
  kind: string;
  weight: string | number | null;
  reps: number | null;
  rpe: string | number | null;
}

/**
 * Every exercise's predicted 1RM (issue #713) now (`predictOneRepMaxNow`), from the raw
 * IndexedDB (or Postgres) rows: supersede chains resolved, deleted sets,
 * workouts and removed exercises left out, as the exercise page reads them.
 * Exercises with no weighted working set have no entry.
 */
export function predictedOneRepMaxByExercise(
  sessions: readonly SessionRowLike[],
  sessionExercises: readonly SessionExerciseRowLike[],
  sets: readonly SetRowLike[],
  now: Date,
): Map<string, PredictedOneRepMax> {
  const deleted = deletedSessionExerciseIds(sessions, sessionExercises);
  const sessionExerciseById = new Map(
    sessionExercises.filter((row) => !deleted.has(row.id)).map((row) => [row.id, row]),
  );
  const setsByExercise = new Map<string, PredictionSet[]>();
  for (const set of resolveCurrentRows(sets)) {
    if (set.deletedAt) continue;
    const sessionExercise = sessionExerciseById.get(set.sessionExerciseId);
    if (!sessionExercise) continue;
    const list = setsByExercise.get(sessionExercise.exerciseId) ?? [];
    list.push({
      sessionId: sessionExercise.sessionId,
      completedAt: set.completedAt,
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
      rpe: set.rpe == null ? null : Number(set.rpe),
      kind: set.kind,
    });
    setsByExercise.set(sessionExercise.exerciseId, list);
  }
  const result = new Map<string, PredictedOneRepMax>();
  for (const [exerciseId, exerciseSets] of setsByExercise) {
    const prediction = predictOneRepMaxNow(exerciseSets, now);
    if (prediction) result.set(exerciseId, prediction);
  }
  return result;
}
