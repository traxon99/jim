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

  describe("fuzzy matching (issue #130)", () => {
    it("ignores spacing and hyphens", () => {
      const catalog = [exercise({ name: "Push-Up" }), exercise({ name: "Pull-Up" })];
      expect(searchExercises(catalog, "pushup").map((e) => e.name)).toEqual(["Push-Up"]);
      expect(searchExercises(catalog, "pull up").map((e) => e.name)).toEqual(["Pull-Up"]);
    });

    it("matches every query word in any order, not just a contiguous phrase", () => {
      const catalog = [
        exercise({ name: "Incline Dumbbell Press" }),
        exercise({ name: "Dumbbell Bench Press" }),
        exercise({ name: "Barbell Curl" }),
      ];
      expect(searchExercises(catalog, "press incline").map((e) => e.name)).toEqual([
        "Incline Dumbbell Press",
      ]);
    });

    it("expands gym shorthand like db and bb", () => {
      const catalog = [
        exercise({ name: "Incline Dumbbell Press" }),
        exercise({ name: "Barbell Curl" }),
      ];
      expect(searchExercises(catalog, "incline db press").map((e) => e.name)).toEqual([
        "Incline Dumbbell Press",
      ]);
      expect(searchExercises(catalog, "bb curl").map((e) => e.name)).toEqual(["Barbell Curl"]);
    });

    it("tolerates small typos, including transposed letters", () => {
      const catalog = [
        exercise({ name: "Barbell Squat" }),
        exercise({ name: "Romanian Deadlift" }),
        exercise({ name: "Pull-Up" }),
      ];
      expect(searchExercises(catalog, "sqaut").map((e) => e.name)).toEqual(["Barbell Squat"]);
      expect(searchExercises(catalog, "romainan deadlfit").map((e) => e.name)).toEqual([
        "Romanian Deadlift",
      ]);
    });

    it("folds simple plurals", () => {
      const catalog = [exercise({ name: "Pull-Up" }), exercise({ name: "Barbell Curl" })];
      expect(searchExercises(catalog, "pull ups").map((e) => e.name)).toEqual(["Pull-Up"]);
      expect(searchExercises(catalog, "barbell curls").map((e) => e.name)).toEqual([
        "Barbell Curl",
      ]);
    });

    it("doesn't apply typo tolerance to short words", () => {
      const catalog = [exercise({ name: "Row" }), exercise({ name: "Bench Dip" })];
      expect(searchExercises(catalog, "raw")).toHaveLength(0);
    });

    it("falls back to equipment and muscles when the name doesn't match", () => {
      const catalog = [
        exercise({ name: "Fly", equipment: "dumbbell", primaryMuscles: ["chest"] }),
        exercise({ name: "Squat", equipment: "barbell", primaryMuscles: ["quadriceps"] }),
      ];
      expect(searchExercises(catalog, "chest dumbbell").map((e) => e.name)).toEqual(["Fly"]);
    });

    it("always ranks a whole-phrase match above a fuzzy one", () => {
      const catalog = [
        exercise({ name: "Squat Jump" }),
        exercise({ name: "Sqat Machine" }),
        exercise({ name: "Barbell Squat" }),
      ];
      const results = searchExercises(catalog, "squat").map((e) => e.name);
      expect(results).toEqual(["Squat Jump", "Barbell Squat", "Sqat Machine"]);
    });
  });
});
