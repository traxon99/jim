import { describe, expect, it } from "vitest";
import { describeExercise, workoutMinutes } from "../format";

describe("describeExercise", () => {
  it("shows the heaviest set in the friend's units", () => {
    expect(describeExercise({ name: "Bench", sets: 3, topWeight: 185, topReps: 5 }, "lb")).toBe(
      "3 sets · top 185 lb × 5",
    );
  });

  it("falls back to reps for bodyweight work", () => {
    expect(describeExercise({ name: "Pull-up", sets: 1, topWeight: null, topReps: 12 }, "kg")).toBe(
      "1 set · best 12 reps",
    );
  });

  it("shows only the set count when nothing else was logged", () => {
    expect(describeExercise({ name: "Plank", sets: 2, topWeight: null, topReps: null }, "lb")).toBe(
      "2 sets",
    );
  });
});

describe("workoutMinutes", () => {
  it("rounds to whole minutes", () => {
    expect(
      workoutMinutes({ startedAt: "2026-09-28T10:00:00Z", endedAt: "2026-09-28T10:47:40Z" }),
    ).toBe(48);
  });

  it("never goes negative", () => {
    expect(
      workoutMinutes({ startedAt: "2026-09-28T11:00:00Z", endedAt: "2026-09-28T10:00:00Z" }),
    ).toBe(0);
  });
});
