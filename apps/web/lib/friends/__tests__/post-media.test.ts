import { describe, expect, it } from "vitest";
import {
  exerciseLine,
  postTint,
  recordLines,
  recordsByExercise,
  routineDot,
  splitRecordDetail,
  timeAgo,
  workoutHeaderLine,
  workoutSets,
} from "../post-media";
import type { FriendWorkout } from "../types";

const NOW = new Date("2026-11-04T12:00:00Z");

describe("timeAgo", () => {
  it("counts minutes, hours and days, then falls back to a date", () => {
    expect(timeAgo("2026-11-04T11:59:40Z", NOW)).toBe("now");
    expect(timeAgo("2026-11-04T11:55:00Z", NOW)).toBe("5m ago");
    expect(timeAgo("2026-11-04T10:00:00Z", NOW)).toBe("2h ago");
    expect(timeAgo("2026-11-01T12:00:00Z", NOW)).toBe("3d ago");
    expect(timeAgo("2026-10-01T12:00:00Z", NOW)).not.toMatch(/ago$/);
  });

  it("treats a time in the future as now", () => {
    expect(timeAgo("2026-11-04T13:00:00Z", NOW)).toBe("now");
  });
});

describe("workoutHeaderLine", () => {
  const workout = {
    name: "Push Day",
    endedAt: "2026-11-04T10:00:00Z",
    gymName: "Iron Works",
  } as FriendWorkout;

  it("joins how long ago and the gym, leaving the name to the title", () => {
    expect(workoutHeaderLine(workout, NOW)).toBe("2h ago · Iron Works");
  });

  it("leaves out a missing gym", () => {
    expect(workoutHeaderLine({ ...workout, gymName: null }, NOW)).toBe("2h ago");
  });
});

describe("postTint", () => {
  it("uses the routine's color, or zinc without one", () => {
    expect(postTint("orange")).toContain("from-orange-400");
    expect(postTint(null)).toContain("from-zinc-600");
  });
});

describe("routineDot", () => {
  it("uses the routine's color, or zinc without one", () => {
    expect(routineDot("teal")).toBe("bg-teal-500");
    expect(routineDot(null)).toContain("bg-zinc-400");
  });
});

describe("workoutSets", () => {
  it("adds up every exercise's sets", () => {
    expect(
      workoutSets({
        exercises: [
          { name: "Bench", sets: 4, topWeight: 225, topReps: 5 },
          { name: "Dips", sets: 3, topWeight: null, topReps: 12 },
        ],
      }),
    ).toBe(7);
    expect(workoutSets({ exercises: [] })).toBe(0);
  });
});

describe("exerciseLine", () => {
  it("shows sets × the top weight", () => {
    expect(exerciseLine({ name: "Bench", sets: 4, topWeight: 225, topReps: 5 }, "lb")).toBe(
      "4 × 225 lb",
    );
  });

  it("falls back to reps, then to sets alone", () => {
    expect(exerciseLine({ name: "Pull-up", sets: 3, topWeight: null, topReps: 12 }, "kg")).toBe(
      "3 × 12 reps",
    );
    expect(exerciseLine({ name: "Plank", sets: 1, topWeight: 0, topReps: null }, "kg")).toBe(
      "1 set",
    );
  });
});

describe("recordsByExercise", () => {
  it("groups a workout's PRs by exercise", () => {
    const e1rm = { exercise: "Bench", kind: "1rm" as const, value: 262, weight: 225, reps: 5 };
    const reps = { ...e1rm, kind: "reps_at_weight" as const, value: 5 };
    const squat = { ...e1rm, exercise: "Squat" };
    const byExercise = recordsByExercise([e1rm, reps, squat]);
    expect(byExercise.get("Bench")).toEqual([e1rm, reps]);
    expect(byExercise.get("Squat")).toEqual([squat]);
    expect(byExercise.has("Row")).toBe(false);
  });
});

describe("recordLines", () => {
  it("describes an e1RM PR with its set", () => {
    expect(
      recordLines(
        { exercise: "Bench Press", kind: "1rm", value: 261.6, weight: 225, reps: 5 },
        "lb",
      ),
    ).toEqual({ title: "Bench Press · 225 lb × 5", detail: "New e1RM · 262 lb" });
  });

  it("describes a rep PR on a bodyweight lift", () => {
    expect(
      recordLines(
        { exercise: "Pull-up", kind: "reps_at_weight", value: 12, weight: null, reps: 12 },
        "kg",
      ),
    ).toEqual({ title: "Pull-up · 12 reps", detail: "New rep PR · 12 reps" });
  });
});

describe("splitRecordDetail", () => {
  it("splits off the amount after the last separator", () => {
    expect(splitRecordDetail("Estimated 1RM · 225 lb")).toEqual({
      label: "Estimated 1RM",
      amount: "225 lb",
    });
  });

  it("keeps a detail without a separator as the label", () => {
    expect(splitRecordDetail("First workout")).toEqual({ label: "First workout", amount: null });
    expect(splitRecordDetail(null)).toEqual({ label: "", amount: null });
  });
});
