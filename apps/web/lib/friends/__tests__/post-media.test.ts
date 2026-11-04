import { describe, expect, it } from "vitest";
import {
  muscleBarPercent,
  postTint,
  recordLines,
  splitRecordDetail,
  timeAgo,
  workoutHeaderLine,
} from "../post-media";
import type { FriendWorkout } from "../types";

const NOW = new Date("2026-11-04T12:00:00Z");

describe("timeAgo", () => {
  it("counts minutes, hours and days, then falls back to a date", () => {
    expect(timeAgo("2026-11-04T11:59:40Z", NOW)).toBe("now");
    expect(timeAgo("2026-11-04T11:55:00Z", NOW)).toBe("5m");
    expect(timeAgo("2026-11-04T10:00:00Z", NOW)).toBe("2h");
    expect(timeAgo("2026-11-01T12:00:00Z", NOW)).toBe("3d");
    expect(timeAgo("2026-10-01T12:00:00Z", NOW)).not.toMatch(/d$/);
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

  it("joins the name, how long ago and the gym", () => {
    expect(workoutHeaderLine(workout, NOW)).toBe("Push Day · 2h · Iron Works");
  });

  it("leaves out a missing gym and names an unnamed workout", () => {
    expect(workoutHeaderLine({ ...workout, name: null, gymName: null }, NOW)).toBe("Workout · 2h");
  });
});

describe("postTint", () => {
  it("uses the routine's color, or zinc without one", () => {
    expect(postTint("orange")).toContain("from-orange-400");
    expect(postTint(null)).toContain("from-zinc-600");
  });
});

describe("muscleBarPercent", () => {
  it("scales against the busiest muscle, never vanishing", () => {
    expect(muscleBarPercent(9, 9)).toBe(100);
    expect(muscleBarPercent(3, 9)).toBe(33);
    expect(muscleBarPercent(0, 9)).toBe(4);
    expect(muscleBarPercent(1, 0)).toBe(0);
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
