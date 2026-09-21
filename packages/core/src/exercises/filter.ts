import type { CatalogExercise } from "./types";

export interface ExerciseFilters {
  muscle?: string;
  equipment?: string;
  /** Default false: archived exercises are hidden unless explicitly asked for. */
  includeArchived?: boolean;
}

export function filterExercises<T extends CatalogExercise>(
  exercises: readonly T[],
  filters: ExerciseFilters,
): T[] {
  return exercises.filter((exercise) => {
    if (!filters.includeArchived && exercise.isArchived) return false;
    if (filters.muscle) {
      const inPrimary = exercise.primaryMuscles.includes(filters.muscle);
      const inSecondary = exercise.secondaryMuscles.includes(filters.muscle);
      if (!inPrimary && !inSecondary) return false;
    }
    if (filters.equipment && exercise.equipment !== filters.equipment) return false;
    return true;
  });
}
