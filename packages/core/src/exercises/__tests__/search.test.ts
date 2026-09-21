import { describe, expect, it } from "vitest";
import { searchExercises } from "../search";
import type { CatalogExercise } from "../types";

function exercise(overrides: Partial<CatalogExercise> & { name: string }): CatalogExercise {
  return {
    id: overrides.name,
    slug: overrides.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    aliases: [],
    ownerId: null,
    isArchived: false,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: null,
    ...overrides,
  };
}

// The real free-exercise-db names containing "bench" (47 of them) — see
// packages/db/src/seed/aliases.ts for why a plain prefix/substring match
// can't tell these apart on its own.
const BENCH_NAMES = [
  "Barbell Bench Press - Medium Grip",
  "Barbell Guillotine Bench Press",
  "Barbell Incline Bench Press - Medium Grip",
  "Barbell Rollout from Bench",
  "Barbell Squat To A Bench",
  "Bench Dips",
  "Bench Jump",
  "Bench Press - Powerlifting",
  "Bench Press - With Bands",
  "Bench Press with Chains",
  "Bench Sprint",
  "Bent Over Dumbbell Rear Delt Raise With Head On Bench",
  "Close-Grip Barbell Bench Press",
  "Decline Barbell Bench Press",
  "Decline Close-Grip Bench To Skull Crusher",
  "Decline Dumbbell Bench Press",
  "Dumbbell Bench Press",
  "Dumbbell Bench Press with Neutral Grip",
  "Dumbbell Squat To A Bench",
  "Flat Bench Cable Flyes",
  "Flat Bench Leg Pull-In",
  "Flat Bench Lying Leg Raise",
  "Front Barbell Squat To A Bench",
  "Hammer Grip Incline DB Bench Press",
  "Hyperextensions With No Hyperextension Bench",
  "Incline Bench Pull",
  "Incline Dumbbell Bench With Palms Facing In",
  "Lying High Bench Barbell Curl",
  "Machine Bench Press",
  "One Arm Dumbbell Bench Press",
  "One-Arm Flat Bench Dumbbell Flye",
  "Palms-Down Dumbbell Wrist Curl Over A Bench",
  "Palms-Down Wrist Curl Over A Bench",
  "Palms-Up Barbell Wrist Curl Over A Bench",
  "Palms-Up Dumbbell Wrist Curl Over A Bench",
  "Reverse Band Bench Press",
  "Reverse Triceps Bench Press",
  "Seated Flat Bench Leg Pull-In",
  "Smith Machine Bench Press",
  "Smith Machine Close-Grip Bench Press",
  "Smith Machine Incline Bench Press",
  "Standing One-Arm Dumbbell Curl Over Incline Bench",
  "Straight Bar Bench Mid Rows",
  "Straight Raises on Incline Bench",
  "Weighted Bench Dip",
  "Wide-Grip Barbell Bench Press",
  "Wide-Grip Decline Barbell Bench Press",
];

describe("searchExercises", () => {
  it("ranks Barbell Bench Press first among every real 'bench' exercise, via its curated alias", () => {
    const catalog = BENCH_NAMES.map((name) =>
      name === "Barbell Bench Press - Medium Grip"
        ? exercise({ name, aliases: ["bench press", "bench"] })
        : exercise({ name }),
    );

    const results = searchExercises(catalog, "bench");

    expect(results).toHaveLength(BENCH_NAMES.length);
    expect(results[0]?.name).toBe("Barbell Bench Press - Medium Grip");
  });

  it("finds an exercise by alias the name doesn't contain at all (OHP)", () => {
    const catalog = [
      exercise({ name: "Standing Military Press", aliases: ["ohp", "overhead press"] }),
      exercise({ name: "Seated Barbell Military Press" }),
      exercise({ name: "Barbell Bench Press - Medium Grip" }),
    ];

    const results = searchExercises(catalog, "OHP");

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Standing Military Press");
  });

  it("ranks an exact name match above everything else", () => {
    const catalog = [
      exercise({ name: "Push-Up Variation" }),
      exercise({ name: "Push-Up" }),
      exercise({ name: "Wide Push-Up" }),
    ];

    const results = searchExercises(catalog, "push-up");

    expect(results[0]?.name).toBe("Push-Up");
  });

  it("is case-insensitive", () => {
    const catalog = [exercise({ name: "Barbell Squat" })];
    expect(searchExercises(catalog, "SQUAT")).toHaveLength(1);
    expect(searchExercises(catalog, "sQuAt")).toHaveLength(1);
  });

  it("excludes exercises that don't match at all", () => {
    const catalog = [exercise({ name: "Barbell Squat" }), exercise({ name: "Pull-Up" })];
    const results = searchExercises(catalog, "squat");
    expect(results.map((e) => e.name)).toEqual(["Barbell Squat"]);
  });

  it("returns every exercise, unranked, for an empty query", () => {
    const catalog = [exercise({ name: "Barbell Squat" }), exercise({ name: "Pull-Up" })];
    expect(searchExercises(catalog, "")).toHaveLength(2);
    expect(searchExercises(catalog, "   ")).toHaveLength(2);
  });
});
