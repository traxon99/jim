import { describe, expect, it } from "vitest";
import type { ExerciseUsage } from "../../exercises/usage";
import {
  type SmartWorkoutExercise,
  type SmartWorkoutSet,
  planSmartWorkout,
} from "../smart-workout";

const NOW = new Date("2026-09-28T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function exercise(
  id: string,
  primaryMuscles: string[],
  overrides: Partial<SmartWorkoutExercise> = {},
): SmartWorkoutExercise {
  return {
    id,
    slug: id,
    name: id,
    primaryMuscles,
    secondaryMuscles: [],
    mechanic: "compound",
    ...overrides,
  };
}

function sets(n: number, daysAgo: number, primaryMuscles: string[]): SmartWorkoutSet[] {
  return Array.from({ length: n }, () => ({
    completedAt: new Date(NOW.getTime() - daysAgo * DAY),
    primaryMuscles,
    secondaryMuscles: [],
  }));
}

const catalog = [
  exercise("bench", ["chest"]),
  exercise("row", ["middle back"]),
  exercise("pulldown", ["lats"]),
  exercise("press", ["shoulders"]),
  exercise("squat", ["quadriceps"]),
  exercise("rdl", ["hamstrings"]),
  exercise("hip-thrust", ["glutes"]),
  exercise("curl", ["biceps"], { mechanic: "isolation" }),
  exercise("pushdown", ["triceps"], { mechanic: "isolation" }),
  exercise("calf-raise", ["calves"], { mechanic: "isolation" }),
  exercise("crunch", ["abdominals"], { mechanic: "isolation" }),
];

function muscles(plan: ReturnType<typeof planSmartWorkout>): string[] {
  return plan.picks.map((pick) => pick.muscle);
}

describe("planSmartWorkout", () => {
  it("targets the muscles with the least recent volume", () => {
    const plan = planSmartWorkout({
      now: NOW,
      // A week of upper-body work, nothing for legs.
      sets: [
        ...sets(10, 3, ["chest"]),
        ...sets(10, 3, ["lats"]),
        ...sets(8, 3, ["middle back"]),
        ...sets(10, 3, ["shoulders"]),
        ...sets(6, 3, ["biceps"]),
        ...sets(6, 3, ["triceps"]),
      ],
      exercises: catalog,
      usage: new Map(),
      exerciseCount: 4,
    });

    // All untouched, so bigger muscles win the tie.
    expect(muscles(plan).sort()).toEqual(["abdominals", "glutes", "hamstrings", "quadriceps"]);
    expect(plan.recentSets.chest).toBe(10);
    expect(plan.recentSets.quadriceps).toBe(0);
  });

  it("ignores sets older than the lookback window", () => {
    const plan = planSmartWorkout({
      now: NOW,
      sets: sets(20, 10, ["chest"]),
      exercises: catalog,
      usage: new Map(),
    });
    expect(plan.recentSets.chest).toBe(0);
  });

  it("puts muscles still recovering behind recovered ones", () => {
    // Legs are the least trained this week, but were hit yesterday.
    const plan = planSmartWorkout({
      now: NOW,
      sets: [
        ...sets(2, 1, ["quadriceps"]),
        ...sets(2, 1, ["hamstrings"]),
        ...sets(2, 1, ["glutes"]),
        ...sets(4, 4, ["chest"]),
        ...sets(4, 4, ["lats"]),
      ],
      exercises: catalog,
      usage: new Map(),
      exerciseCount: 3,
    });
    for (const muscle of muscles(plan)) {
      expect(["quadriceps", "hamstrings", "glutes"]).not.toContain(muscle);
    }
  });

  it("spreads picks across muscles instead of stacking one gap", () => {
    const plan = planSmartWorkout({
      now: NOW,
      sets: [],
      exercises: [
        ...catalog,
        exercise("incline", ["chest"]),
        exercise("fly", ["chest"], { mechanic: "isolation" }),
      ],
      usage: new Map(),
      exerciseCount: 5,
    });
    expect(new Set(muscles(plan)).size).toBe(5);
  });

  it("prefers exercises the user already does, then staple lifts", () => {
    const usage = new Map<string, ExerciseUsage>([
      ["user-bench", { lastPerformedAt: new Date("2026-08-01"), frequency: 4 }],
    ]);
    const plan = planSmartWorkout({
      now: NOW,
      sets: [],
      exercises: [
        exercise("obscure-chest", ["chest"], { name: "A obscure" }),
        exercise("user-bench", ["chest"], { name: "Z bench" }),
        exercise("barbell-squat", ["quadriceps"], { name: "Z squat" }),
        exercise("obscure-quad", ["quadriceps"], { name: "A obscure quad" }),
      ],
      usage,
      exerciseCount: 2,
    });
    expect(plan.picks.map((pick) => pick.exerciseId).sort()).toEqual([
      "barbell-squat",
      "user-bench",
    ]);
  });

  it("orders compound lifts before isolation work", () => {
    const plan = planSmartWorkout({
      now: NOW,
      sets: [],
      exercises: [
        exercise("curl", ["biceps"], { mechanic: "isolation" }),
        exercise("squat", ["quadriceps"]),
      ],
      usage: new Map(),
      exerciseCount: 2,
    });
    expect(plan.picks.map((pick) => pick.exerciseId)).toEqual(["squat", "curl"]);
  });

  it("returns what it can when the catalog is small", () => {
    const plan = planSmartWorkout({
      now: NOW,
      sets: [],
      exercises: [exercise("bench", ["chest"])],
      usage: new Map(),
      exerciseCount: 5,
    });
    expect(plan.picks).toEqual([{ exerciseId: "bench", muscle: "chest" }]);
    expect(planSmartWorkout({ now: NOW, sets: [], exercises: [], usage: new Map() }).picks).toEqual(
      [],
    );
  });
});
