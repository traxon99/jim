import { describe, expect, it } from "vitest";
import type { CatalogExercise } from "../types";
import { buildExerciseUsage, sortExercisesByUsage } from "../usage";

function exercise(overrides: Partial<CatalogExercise> & { id: string }): CatalogExercise {
  return {
    slug: overrides.id,
    name: overrides.id,
    aliases: [],
    ownerId: null,
    isArchived: false,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: null,
    ...overrides,
  };
}

describe("buildExerciseUsage", () => {
  it("counts distinct sessions and tracks the most recent startedAt per exercise", () => {
    const usage = buildExerciseUsage([
      { exerciseId: "squat", sessionId: "s1", startedAt: new Date("2026-01-01") },
      { exerciseId: "squat", sessionId: "s2", startedAt: new Date("2026-01-08") },
      // Two rows in the same session (e.g. a superset repeat) count once.
      { exerciseId: "squat", sessionId: "s2", startedAt: new Date("2026-01-08") },
      { exerciseId: "bench", sessionId: "s1", startedAt: new Date("2026-01-01") },
    ]);

    expect(usage.get("squat")).toEqual({ lastPerformedAt: new Date("2026-01-08"), frequency: 2 });
    expect(usage.get("bench")).toEqual({ lastPerformedAt: new Date("2026-01-01"), frequency: 1 });
  });

  it("leaves out exercises with no rows rather than a zero entry", () => {
    const usage = buildExerciseUsage([]);
    expect(usage.get("never-performed")).toBeUndefined();
  });
});

describe("sortExercisesByUsage", () => {
  const catalog = [
    exercise({ id: "c", name: "Squat" }),
    exercise({ id: "a", name: "Bench Press" }),
    exercise({ id: "b", name: "Deadlift" }),
  ];

  it("sorts by name alphabetically, ignoring usage", () => {
    const usage = buildExerciseUsage([]);
    const sorted = sortExercisesByUsage(catalog, usage, "name");
    expect(sorted.map((e) => e.name)).toEqual(["Bench Press", "Deadlift", "Squat"]);
  });

  it("sorts by most recently performed first, with never-performed exercises last", () => {
    const usage = buildExerciseUsage([
      { exerciseId: "a", sessionId: "s1", startedAt: new Date("2026-01-01") },
      { exerciseId: "c", sessionId: "s2", startedAt: new Date("2026-02-01") },
    ]);
    const sorted = sortExercisesByUsage(catalog, usage, "lastPerformed");
    expect(sorted.map((e) => e.name)).toEqual(["Squat", "Bench Press", "Deadlift"]);
  });

  it("sorts by highest frequency first, breaking ties by name", () => {
    const usage = buildExerciseUsage([
      { exerciseId: "a", sessionId: "s1", startedAt: new Date("2026-01-01") },
      { exerciseId: "a", sessionId: "s2", startedAt: new Date("2026-01-08") },
      { exerciseId: "a", sessionId: "s3", startedAt: new Date("2026-01-15") },
      { exerciseId: "b", sessionId: "s1", startedAt: new Date("2026-01-01") },
      { exerciseId: "c", sessionId: "s1", startedAt: new Date("2026-01-01") },
    ]);
    const sorted = sortExercisesByUsage(catalog, usage, "frequency");
    expect(sorted.map((e) => e.name)).toEqual(["Bench Press", "Deadlift", "Squat"]);
  });
});
