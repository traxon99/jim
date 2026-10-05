import type { ExerciseRow, SessionExerciseRow, SessionRow, SetRow } from "@/lib/db/schema";
import {
  type MuscleVolumeSet,
  deletedSessionExerciseIds,
  isStrengthExercise,
  resolveCurrentRows,
} from "@jim/core";

/**
 * Joins each current, non-deleted set to its exercise's muscle groups, for
 * `weeklyVolumeByMuscle`. Only working sets count: warm-up exercises are
 * tracked for how often they're done, not as training volume (issue #59),
 * and warm-up sets on a working exercise don't count toward the weekly set
 * targets either (issue #395). Sets from deleted workouts are left out too
 * (issue #200).
 */
export function buildMuscleVolumeSets(
  sessions: readonly SessionRow[],
  sessionExercises: readonly SessionExerciseRow[],
  exercises: readonly (Pick<ExerciseRow, "id" | "primaryMuscles" | "secondaryMuscles"> &
    Partial<Pick<ExerciseRow, "category">>)[],
  sets: readonly SetRow[],
): MuscleVolumeSet[] {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const sessionExerciseById = new Map(sessionExercises.map((se) => [se.id, se]));
  const deleted = deletedSessionExerciseIds(sessions, sessionExercises);
  const resolvedSets = resolveCurrentRows(sets).filter(
    (set) => !set.deletedAt && set.kind !== "warmup",
  );

  const result: MuscleVolumeSet[] = [];
  for (const set of resolvedSets) {
    const sessionExercise = sessionExerciseById.get(set.sessionExerciseId);
    if (!sessionExercise || deleted.has(sessionExercise.id)) continue;
    const exercise = exerciseById.get(sessionExercise.exerciseId);
    if (!exercise || !isStrengthExercise(exercise)) continue;

    result.push({
      completedAt: set.completedAt,
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
      primaryMuscles: exercise.primaryMuscles,
      secondaryMuscles: exercise.secondaryMuscles,
    });
  }
  return result;
}
