import { describe, expect, it } from "vitest";
import { filterExercises } from "../filter";
import type { CatalogExercise } from "../types";

function exercise(overrides: Partial<CatalogExercise> & { name: string }): CatalogExercise {
  return {
    id: overrides.name,
    slug: overrides.name.toLowerCase(),
    aliases: [],
    ownerId: null,
    isArchived: false,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: null,
    ...overrides,
  };
}

describe("filterExercises", () => {
  it("filters by primary or secondary muscle", () => {
    const catalog = [
      exercise({ name: "Bench Press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps"] }),
      exercise({ name: "Squat", primaryMuscles: ["quadriceps"] }),
    ];
    expect(filterExercises(catalog, { muscle: "triceps" }).map((e) => e.name)).toEqual([
      "Bench Press",
    ]);
    expect(filterExercises(catalog, { muscle: "chest" }).map((e) => e.name)).toEqual([
      "Bench Press",
    ]);
  });

  it("filters by equipment", () => {
    const catalog = [
      exercise({ name: "Bench Press", equipment: "barbell" }),
      exercise({ name: "Push-Up", equipment: "body only" }),
    ];
    expect(filterExercises(catalog, { equipment: "barbell" }).map((e) => e.name)).toEqual([
      "Bench Press",
    ]);
  });

  it("hides archived exercises by default", () => {
    const catalog = [
      exercise({ name: "Bench Press" }),
      exercise({ name: "Retired Machine", isArchived: true }),
    ];
    expect(filterExercises(catalog, {}).map((e) => e.name)).toEqual(["Bench Press"]);
    expect(filterExercises(catalog, { includeArchived: true }).map((e) => e.name)).toEqual([
      "Bench Press",
      "Retired Machine",
    ]);
  });

  it("combines filters", () => {
    const catalog = [
      exercise({ name: "A", primaryMuscles: ["chest"], equipment: "barbell" }),
      exercise({ name: "B", primaryMuscles: ["chest"], equipment: "dumbbell" }),
    ];
    expect(filterExercises(catalog, { muscle: "chest", equipment: "barbell" })).toHaveLength(1);
  });

  it("filters by category, treating rows with no category as strength", () => {
    const catalog = [
      exercise({ name: "Squat" }),
      exercise({ name: "Pigeon Stretch", category: "warmup" }),
      exercise({ name: "Deadlift", category: "strength" }),
    ];
    expect(filterExercises(catalog, { category: "warmup" }).map((e) => e.name)).toEqual([
      "Pigeon Stretch",
    ]);
    expect(filterExercises(catalog, { category: "strength" }).map((e) => e.name)).toEqual([
      "Squat",
      "Deadlift",
    ]);
  });
});
