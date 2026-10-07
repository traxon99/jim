import { CARDIO_EXERCISES, CURATED_EXERCISES } from "@jim/core";
import type { SeedExercise } from "./free-exercise-db";

/** Curated strength exercises from @jim/core (issue #141), as global seed rows. */
export function curatedSeedRows(): SeedExercise[] {
  return CURATED_EXERCISES.map((entry) => ({
    ownerId: null,
    slug: entry.slug,
    name: entry.name,
    aliases: [...entry.aliases],
    primaryMuscles: [...entry.primaryMuscles],
    secondaryMuscles: [...entry.secondaryMuscles],
    equipment: entry.equipment,
    mechanic: entry.mechanic,
    force: entry.force,
    level: "beginner",
    trackingType: entry.trackingType,
    category: "strength",
    instructions: [...entry.instructions],
    imageUrls: [],
  }));
}

/** Curated cardio from @jim/core (issue #423), as global seed rows. */
export function cardioSeedRows(): SeedExercise[] {
  return CARDIO_EXERCISES.map((entry) => ({
    ownerId: null,
    slug: entry.slug,
    name: entry.name,
    aliases: [...entry.aliases],
    primaryMuscles: [...entry.primaryMuscles],
    secondaryMuscles: [...entry.secondaryMuscles],
    equipment: entry.equipment,
    mechanic: null,
    force: null,
    level: "beginner",
    trackingType: entry.trackingType,
    category: "cardio",
    instructions: [...entry.instructions],
    imageUrls: [],
  }));
}
