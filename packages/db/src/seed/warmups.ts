import { WARMUP_EXERCISES } from "@jim/core";
import type { SeedExercise } from "./free-exercise-db";

/**
 * free-exercise-db's own "stretching" category is exactly what issue #59
 * means by a warm-up/stretch, so those rows land in the warmup category
 * alongside the curated list below. Its "cardio" rows are cardio (issue
 * #423).
 */
export function classifyCategory(raw: { category: string | null }): SeedExercise["category"] {
  if (raw.category === "stretching") return "warmup";
  if (raw.category === "cardio") return "cardio";
  return "strength";
}

/** The curated warm-ups from @jim/core, as global seed rows. */
export function warmupSeedRows(): SeedExercise[] {
  return WARMUP_EXERCISES.map((entry) => ({
    ownerId: null,
    slug: entry.slug,
    name: entry.name,
    aliases: [],
    primaryMuscles: [...entry.primaryMuscles],
    secondaryMuscles: [...entry.secondaryMuscles],
    equipment: entry.equipment,
    mechanic: null,
    force: null,
    level: "beginner",
    trackingType: entry.trackingType,
    category: "warmup",
    instructions: [...entry.instructions],
    imageUrls: [],
  }));
}
