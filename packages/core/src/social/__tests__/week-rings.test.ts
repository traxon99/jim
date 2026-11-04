import { describe, expect, it } from "vitest";
import {
  sortWeekRingPeople,
  toWeekRingDisplay,
  weekRingGoalMet,
  weekRingProgress,
} from "../week-rings";

describe("week rings", () => {
  it("computes progress and goal met", () => {
    expect(weekRingProgress(2, 4)).toBe(0.5);
    expect(weekRingGoalMet(4, 4)).toBe(true);
    expect(weekRingGoalMet(3, 4)).toBe(false);
  });

  it("sorts you first, then incomplete by recent workout, then complete", () => {
    const people = sortWeekRingPeople([
      {
        userId: "a",
        username: "done",
        avatar: null,
        shareWorkouts: true,
        workoutsThisWeek: 4,
        weeklyGoal: 4,
        lastWorkoutAt: "2026-11-01T12:00:00.000Z",
      },
      {
        userId: "b",
        username: "you",
        avatar: null,
        shareWorkouts: true,
        workoutsThisWeek: 1,
        weeklyGoal: 4,
        lastWorkoutAt: "2026-11-04T12:00:00.000Z",
        isSelf: true,
      },
      {
        userId: "c",
        username: "recent",
        avatar: null,
        shareWorkouts: true,
        workoutsThisWeek: 2,
        weeklyGoal: 4,
        lastWorkoutAt: "2026-11-04T10:00:00.000Z",
      },
      {
        userId: "d",
        username: "older",
        avatar: null,
        shareWorkouts: true,
        workoutsThisWeek: 1,
        weeklyGoal: 4,
        lastWorkoutAt: "2026-11-02T12:00:00.000Z",
      },
    ]);
    expect(people.map((p) => p.username)).toEqual(["you", "recent", "older", "done"]);
  });

  it("hides ring progress when sharing is off", () => {
    const display = toWeekRingDisplay({
      userId: "x",
      username: "private",
      avatar: null,
      shareWorkouts: false,
      workoutsThisWeek: 3,
      weeklyGoal: 4,
      lastWorkoutAt: null,
    });
    expect(display.progress).toBeNull();
  });
});
