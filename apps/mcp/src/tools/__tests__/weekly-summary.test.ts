import { describe, expect, it } from "vitest";
import type { ResolvedSet } from "../volume-report.js";
import { type SummaryExercise, summarizeWeeks, weekStartsEndingAt } from "../weekly-summary.js";

const exercises = new Map<string, SummaryExercise>([
  ["bench", { name: "Bench Press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps"] }],
  ["pullup", { name: "Pull-up", primaryMuscles: ["lats"], secondaryMuscles: [] }],
  [
    "bike",
    { name: "Bike", category: "warmup", primaryMuscles: ["quadriceps"], secondaryMuscles: [] },
  ],
]);

function set(
  sessionId: string,
  exerciseId: string,
  completedAt: string,
  weight: number | null,
  reps: number | null,
): ResolvedSet {
  return { sessionId, exerciseId, completedAt: new Date(completedAt), weight, reps };
}

describe("weekly_summary (#409)", () => {
  // Monday-start weeks. 2026-10-05 is a Monday.
  const weekStarts = weekStartsEndingAt(new Date(2026, 9, 7, 12), 2, 1);

  it("lists the requested weeks newest first, starting on the user's week-start day", () => {
    expect(weekStarts).toEqual([new Date(2026, 9, 5), new Date(2026, 8, 28)]);
  });

  it("counts workouts, working sets and volume per week, muscle and exercise", () => {
    const sets = [
      set("a", "bench", new Date(2026, 9, 5, 18).toISOString(), 100, 5),
      set("a", "bench", new Date(2026, 9, 5, 18, 5).toISOString(), 100, 5),
      set("a", "bike", new Date(2026, 9, 5, 17).toISOString(), null, null),
      set("b", "pullup", new Date(2026, 9, 7, 18).toISOString(), null, 8),
      // Last week.
      set("c", "bench", new Date(2026, 9, 1, 18).toISOString(), 90, 5),
    ];

    const [thisWeek, lastWeek] = summarizeWeeks(sets, exercises, weekStarts, 1, "strength");

    expect(thisWeek).toMatchObject({
      weekStart: new Date(2026, 9, 5).toISOString(),
      weekEnd: new Date(2026, 9, 12).toISOString(),
      workouts: 2,
      workingSets: 3,
      totalVolume: 1000,
      setsByMuscle: { chest: 2, triceps: 1, lats: 1 },
      volumeByMuscle: { chest: 1000, triceps: 500 },
      goal: "strength",
      targetSets: { min: 5, max: 10 },
      setStatusByMuscle: { chest: "under", triceps: "under", lats: "under" },
      exercises: [
        { exerciseId: "bench", exerciseName: "Bench Press", sets: 2, volume: 1000 },
        { exerciseId: "pullup", exerciseName: "Pull-up", sets: 1, volume: 0 },
      ],
    });
    // The warm-up exercise is left out entirely.
    expect(thisWeek?.setsByMuscle).not.toHaveProperty("quadriceps");

    expect(lastWeek).toMatchObject({ workouts: 1, workingSets: 1, totalVolume: 450 });
  });

  it("returns an empty week rather than nothing on a rest week", () => {
    const [week] = summarizeWeeks([], exercises, weekStarts.slice(0, 1), 1, "hypertrophy");
    expect(week).toMatchObject({
      workouts: 0,
      workingSets: 0,
      totalVolume: 0,
      setsByMuscle: {},
      exercises: [],
    });
  });
});
