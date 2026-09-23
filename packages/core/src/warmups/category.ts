export type ExerciseCategory = "strength" | "warmup";
export type RoutineKind = "strength" | "warmup";

/**
 * Rows synced to a device before the category/kind columns existed (issue
 * #59) sit in IndexedDB without the field until they next change, so a
 * missing value has to read as the column's default ("strength") rather
 * than being trusted to be present.
 */
export function exerciseCategoryOf(exercise: {
  category?: ExerciseCategory | null;
}): ExerciseCategory {
  return exercise.category === "warmup" ? "warmup" : "strength";
}

export function isWarmupExercise(exercise: { category?: ExerciseCategory | null }): boolean {
  return exerciseCategoryOf(exercise) === "warmup";
}

export function isWarmupRoutine(routine: { kind?: RoutineKind | null }): boolean {
  return routine.kind === "warmup";
}
