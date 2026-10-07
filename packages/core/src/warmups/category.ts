export type ExerciseCategory = "strength" | "warmup" | "cardio";
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
  if (exercise.category === "warmup" || exercise.category === "cardio") return exercise.category;
  return "strength";
}

export function isWarmupExercise(exercise: { category?: ExerciseCategory | null }): boolean {
  return exerciseCategoryOf(exercise) === "warmup";
}

/**
 * Cardio (issue #423) is logged in the workout alongside strength, but for
 * time and/or distance — so, like warm-ups, it stays out of anything that
 * counts training volume: weekly sets, the body map, DPR and PRs.
 */
export function isCardioExercise(exercise: { category?: ExerciseCategory | null }): boolean {
  return exerciseCategoryOf(exercise) === "cardio";
}

/** Whether an exercise's sets count toward strength volume (neither warm-up nor cardio). */
export function isStrengthExercise(exercise: { category?: ExerciseCategory | null }): boolean {
  return exerciseCategoryOf(exercise) === "strength";
}

export function isWarmupRoutine(routine: { kind?: RoutineKind | null }): boolean {
  return routine.kind === "warmup";
}
