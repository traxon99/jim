/** The subset of an exercise row every catalog helper here actually needs. */
export interface CatalogExercise {
  id: string;
  slug: string;
  name: string;
  aliases: readonly string[];
  ownerId: string | null;
  isArchived: boolean;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  equipment: string | null;
  /**
   * Optional because rows cached locally before the column existed (issue
   * #59) don't carry it — absent reads as "strength" (see exerciseCategoryOf).
   */
  category?: "strength" | "warmup" | "cardio" | null;
}
