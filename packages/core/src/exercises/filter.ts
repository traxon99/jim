import { type ExerciseCategory, exerciseCategoryOf } from "../warmups/category";
import { muscleTargetPath } from "./muscle-tree";
import type { CatalogExercise } from "./types";

export interface ExerciseFilters {
  muscle?: string;
  equipment?: string;
  /** Narrows to one category: strength, warm-ups/stretches, or cardio (issue #423). */
  category?: ExerciseCategory;
  /** Default false: archived exercises are hidden unless explicitly asked for. */
  includeArchived?: boolean;
}

export function filterExercises<T extends CatalogExercise>(
  exercises: readonly T[],
  filters: ExerciseFilters,
): T[] {
  return exercises.filter((exercise) => {
    if (!filters.includeArchived && exercise.isArchived) return false;
    if (filters.muscle && !exerciseReaches(exercise, filters.muscle)) return false;
    if (filters.equipment && exercise.equipment !== filters.equipment) return false;
    if (filters.category && exerciseCategoryOf(exercise) !== filters.category) return false;
    return true;
  });
}

/**
 * Whether an exercise works `muscle`: a group it's tagged with, or any muscle
 * tree node at or above one of its node tags (issue #879), so filtering by
 * "deltoid" finds a lateral raise tagged side delt.
 */
export function exerciseReaches(
  exercise: Pick<
    CatalogExercise,
    "primaryMuscles" | "secondaryMuscles" | "primaryTargets" | "secondaryTargets"
  >,
  muscle: string,
): boolean {
  if (exercise.primaryMuscles.includes(muscle) || exercise.secondaryMuscles.includes(muscle)) {
    return true;
  }
  return [...(exercise.primaryTargets ?? []), ...(exercise.secondaryTargets ?? [])].some((id) =>
    muscleTargetPath(id).includes(muscle),
  );
}
