import type { ExerciseRow, SessionExerciseRow, SessionRow, SetRow } from "@/lib/db/schema";
import {
  type ProgramProgressSet,
  deletedSessionExerciseIds,
  isWarmupExercise,
  resolveCurrentRows,
} from "@jim/core";

/**
 * Adapts Dexie's raw rows to `summarizeProgramProgress`'s sets: current,
 * non-deleted working sets only. Warm-up sets and warm-up exercises aren't
 * training progress (issue #395), and sets from deleted workouts drop out
 * (issue #200).
 */
export function buildProgramProgressSets(
  sessions: readonly SessionRow[],
  sessionExercises: readonly SessionExerciseRow[],
  exercises: readonly (Pick<ExerciseRow, "id"> & Partial<Pick<ExerciseRow, "category">>)[],
  sets: readonly SetRow[],
): ProgramProgressSet[] {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const sessionExerciseById = new Map(sessionExercises.map((se) => [se.id, se]));
  const deleted = deletedSessionExerciseIds(sessions, sessionExercises);

  const result: ProgramProgressSet[] = [];
  for (const set of resolveCurrentRows(sets)) {
    if (set.deletedAt || set.kind === "warmup") continue;
    const sessionExercise = sessionExerciseById.get(set.sessionExerciseId);
    if (!sessionExercise || deleted.has(sessionExercise.id)) continue;
    const exercise = exerciseById.get(sessionExercise.exerciseId);
    if (exercise && isWarmupExercise(exercise)) continue;

    result.push({
      sessionId: sessionExercise.sessionId,
      exerciseId: sessionExercise.exerciseId,
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
    });
  }
  return result;
}
