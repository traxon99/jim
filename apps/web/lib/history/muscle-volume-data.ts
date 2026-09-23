import type { ExerciseRow, SessionExerciseRow, SetRow } from "@/lib/db/schema";
import { type MuscleVolumeSet, isWarmupExercise, resolveCurrentRows } from "@jim/core";

/**
 * Joins each current, non-deleted set to its exercise's muscle groups, for
 * `weeklyVolumeByMuscle`. Warm-ups are left out: they're tracked for how
 * often they're done, not as training volume (issue #59).
 */
export function buildMuscleVolumeSets(
  sessionExercises: readonly SessionExerciseRow[],
  exercises: readonly (Pick<ExerciseRow, "id" | "primaryMuscles" | "secondaryMuscles"> &
    Partial<Pick<ExerciseRow, "category">>)[],
  sets: readonly SetRow[],
): MuscleVolumeSet[] {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const sessionExerciseById = new Map(sessionExercises.map((se) => [se.id, se]));
  const resolvedSets = resolveCurrentRows(sets).filter((set) => !set.deletedAt);

  const result: MuscleVolumeSet[] = [];
  for (const set of resolvedSets) {
    const sessionExercise = sessionExerciseById.get(set.sessionExerciseId);
    if (!sessionExercise || sessionExercise.deletedAt) continue;
    const exercise = exerciseById.get(sessionExercise.exerciseId);
    if (!exercise || isWarmupExercise(exercise)) continue;

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
