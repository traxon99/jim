import { describe, expect, it } from "vitest";
import {
  type InsightExercise,
  type InsightWorkout,
  type InsightWorkoutSet,
  postWorkoutInsights,
  relativeChange,
  workoutTotals,
} from "../post-workout-insights";

const BENCH = "bench";
const ROW = "row";
const exercises = new Map<string, InsightExercise>([
  [
    BENCH,
    { primaryMuscles: ["chest"], secondaryMuscles: ["shoulders", "triceps"], isStrength: true },
  ],
  [
    ROW,
    { primaryMuscles: ["lats", "middle back"], secondaryMuscles: ["biceps"], isStrength: true },
  ],
]);

function set(
  exerciseId: string,
  weight: number | null,
  reps: number | null,
  extra: Partial<InsightWorkoutSet> = {},
): InsightWorkoutSet {
  return {
    exerciseId,
    weight,
    reps,
    rpe: null,
    kind: "working",
    restSeconds: null,
    completedAt: new Date(),
    ...extra,
  };
}

function workout(
  id: string,
  start: Date,
  minutes: number,
  sets: InsightWorkoutSet[],
  routineId: string | null = "push",
): InsightWorkout {
  return {
    id,
    routineId,
    startedAt: start,
    endedAt: new Date(start.getTime() + minutes * 60_000),
    sets,
  };
}

// Thursday 2026-11-26, local time; weeks start on Sunday (0).
const today = new Date(2026, 10, 26, 18, 0);
const daysAgo = (n: number) => new Date(2026, 10, 26 - n, 18, 0);

describe("workoutTotals", () => {
  it("leaves warm-ups out and averages rest and RPE over working sets", () => {
    const totals = workoutTotals(
      workout("a", today, 50, [
        set(BENCH, 95, 10, { kind: "warmup", restSeconds: 30, rpe: 5 }),
        set(BENCH, 200, 5, { restSeconds: 120, rpe: 8 }),
        set(BENCH, 200, 5, { restSeconds: 100, rpe: 9 }),
      ]),
    );
    expect(totals).toEqual({
      volume: 2000,
      durationSeconds: 3000,
      reps: 10,
      setCount: 2,
      averageRestSeconds: 110,
      volumePerMinute: 40,
      averageRpe: 8.5,
    });
  });

  it("has no rate under a minute and no averages without data", () => {
    const totals = workoutTotals(workout("a", today, 0, [set(BENCH, 100, 5)]));
    expect(totals.volumePerMinute).toBeNull();
    expect(totals.averageRestSeconds).toBeNull();
    expect(totals.averageRpe).toBeNull();
  });
});

describe("postWorkoutInsights", () => {
  const current = workout("now", today, 58, [
    set(BENCH, 195, 8),
    set(BENCH, 195, 7, { rpe: 9.5 }),
    set(ROW, 150, 10, { rpe: 8 }),
  ]);
  const lastPush = workout("p1", daysAgo(7), 61, [set(BENCH, 187.5, 8)]);
  const pull = workout("pull", daysAgo(5), 40, [set(ROW, 140, 10)], "pull");
  const thisWeekPull = workout("pull2", daysAgo(2), 45, [set(ROW, 150, 8)], "pull");

  const insights = postWorkoutInsights({
    current,
    history: [thisWeekPull, current, pull, lastPush],
    exercises,
    weekStart: 0,
  });

  it("compares with the last workout of the same routine", () => {
    expect(insights.previous?.startedAt).toEqual(daysAgo(7));
    expect(insights.previous?.totals.volume).toBe(1500);
  });

  it("has no previous workout without a routine", () => {
    const free = { ...current, routineId: null };
    expect(
      postWorkoutInsights({ current: free, history: [lastPush], exercises, weekStart: 0 }).previous,
    ).toBeNull();
  });

  it("trends each lift's best e1RM across workouts", () => {
    const bench = insights.lifts.find((lift) => lift.exerciseId === BENCH);
    expect(bench?.oneRepMax).toBe(247);
    expect(bench?.previous).toBe(237.5);
    expect(bench?.series).toEqual([237.5, 247]);
    const row = insights.lifts.find((lift) => lift.exerciseId === ROW);
    expect(row?.series).toEqual([186.67, 190, 200]);
    expect(row?.previous).toBe(190);
  });

  it("keeps at most six points per lift", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      workout(`b${i}`, daysAgo(30 - i), 30, [set(BENCH, 100 + i, 5)]),
    );
    const result = postWorkoutInsights({ current, history: many, exercises, weekStart: 0 });
    expect(result.lifts[0]?.series).toHaveLength(6);
  });

  it("puts this week and last week's volume on the right days", () => {
    // Sunday-first: Thursday is index 4; this week's pull was Tuesday (2).
    expect(insights.week.todayIndex).toBe(4);
    expect(insights.week.days[4]?.thisWeek).toBe(195 * 8 + 195 * 7 + 1500);
    expect(insights.week.days[2]?.thisWeek).toBe(1200);
    // Last week: push on Thursday (4), pull on Saturday (6).
    expect(insights.week.days[4]?.lastWeek).toBe(1500);
    expect(insights.week.days[6]?.lastWeek).toBe(1400);
    expect(insights.week.workouts).toBe(2);
    expect(insights.week.durationSeconds).toBe((58 + 45) * 60);
    expect(insights.week.lastWeekToDate).toBe(1500);
  });

  it("follows the user's week start", () => {
    const monday = postWorkoutInsights({ current, history: [pull], exercises, weekStart: 1 });
    expect(monday.week.todayIndex).toBe(3);
    expect(monday.week.days[5]?.lastWeek).toBe(1400);
  });

  it("counts sets per muscle group once per set, secondary at half", () => {
    const chest = insights.week.muscles.find((m) => m.group === "chest");
    expect(chest).toEqual({ group: "chest", thisWeek: 2, lastWeek: 1 });
    // Lats and middle back are both back: one set each, not two.
    const back = insights.week.muscles.find((m) => m.group === "back");
    expect(back).toEqual({ group: "back", thisWeek: 2, lastWeek: 1 });
    const arms = insights.week.muscles.find((m) => m.group === "arms");
    expect(arms).toEqual({ group: "arms", thisWeek: 2, lastWeek: 1 });
    expect(insights.week.muscles.map((m) => m.group)).not.toContain("legs");
  });

  it("finds the heaviest set, the hardest set and the volume split", () => {
    expect(insights.facts.heaviest).toEqual({ exerciseId: BENCH, weight: 195, reps: 8 });
    expect(insights.facts.topRpe).toEqual({ exerciseId: BENCH, rpe: 9.5, setNumber: 2 });
    expect(insights.facts.split.map((s) => s.exerciseId)).toEqual([BENCH, ROW]);
    expect(insights.facts.split[0]?.share).toBeCloseTo(2925 / 4425);
  });

  it("ignores later workouts", () => {
    const later = workout("later", new Date(2026, 10, 27, 9), 30, [set(BENCH, 300, 5)]);
    const result = postWorkoutInsights({ current, history: [later], exercises, weekStart: 0 });
    expect(result.lifts[0]?.previous).toBeNull();
    expect(result.week.days[5]?.thisWeek).toBe(0);
  });
});

describe("relativeChange", () => {
  it("is null without a baseline", () => {
    expect(relativeChange(10, null)).toBeNull();
    expect(relativeChange(10, 0)).toBeNull();
    expect(relativeChange(110, 100)).toBeCloseTo(0.1);
  });
});
