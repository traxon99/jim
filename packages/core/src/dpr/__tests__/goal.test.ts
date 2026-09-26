import { describe, expect, it } from "vitest";
import { estimateOneRepMax } from "../../one-rep-max";
import { rpeAdjustedE1rm, sessionE1rm } from "../e1rm";
import { focusCandidates } from "../focus-candidates";
import {
  GOAL_TABLE,
  baselineE1rm,
  computeGoal,
  goalDate,
  inferExperience,
  layoffDays,
  onTrackStatus,
} from "../goal";
import { DPR_PRESETS } from "../presets";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

describe("rpeAdjustedE1rm", () => {
  it("matches plain Epley at RPE 10", () => {
    expect(rpeAdjustedE1rm(200, 5, 10)).toBe(estimateOneRepMax(200, 5));
  });

  it("adds reps in reserve before Epley", () => {
    // 5 reps @ RPE 8 → 7 reps to failure
    expect(rpeAdjustedE1rm(200, 5, 8)).toBe(estimateOneRepMax(200, 7));
    expect(rpeAdjustedE1rm(200, 1, 7.5)).toBe(estimateOneRepMax(200, 3.5));
  });

  it("treats a missing RPE as RPE 10 and zeroes empty sets", () => {
    expect(rpeAdjustedE1rm(200, 5, null)).toBe(estimateOneRepMax(200, 5));
    expect(rpeAdjustedE1rm(0, 5, 8)).toBe(0);
  });

  it("takes the best working set for a session", () => {
    expect(
      sessionE1rm([
        { kind: "warmup", weight: 300, reps: 5, rpe: 10 },
        { kind: "working", weight: 200, reps: 5, rpe: 8 },
        { kind: "working", weight: 210, reps: 3, rpe: 9 },
      ]),
    ).toBe(estimateOneRepMax(200, 7));
  });
});

describe("inferExperience", () => {
  const profile = { sex: "male" as const, bodyweight: 180 };

  it("uses strength standards when the profile allows", () => {
    expect(inferExperience({ historyWeeks: 500, e1rmByLift: { squat: 150 }, profile })).toBe(
      "novice",
    );
    expect(inferExperience({ historyWeeks: 1, e1rmByLift: { squat: 400 }, profile })).toBe(
      "advanced",
    );
  });

  it("takes the lower median across lifts", () => {
    expect(
      inferExperience({
        historyWeeks: 1,
        e1rmByLift: { squat: 400, benchPress: 100 },
        profile,
      }),
    ).toBe("novice");
  });

  it.each([
    [10, "novice"],
    [25, "novice"],
    [26, "intermediate"],
    [103, "intermediate"],
    [104, "advanced"],
  ] as const)("falls back to training age: %s weeks → %s", (historyWeeks, level) => {
    expect(inferExperience({ historyWeeks, e1rmByLift: { squat: 400 }, profile: null })).toBe(
      level,
    );
    expect(inferExperience({ historyWeeks, e1rmByLift: {}, profile })).toBe(level);
  });
});

describe("computeGoal", () => {
  it.each([
    ["novice", "conservative", 12, 240],
    ["novice", "moderate", 12, 250],
    ["novice", "aggressive", 12, 260],
    ["intermediate", "moderate", 6, 210],
    ["intermediate", "aggressive", 8, 216],
    ["advanced", "moderate", 12, 207],
    ["advanced", "conservative", 6, 202],
  ] as const)("%s / %s / %s weeks from 200 → %s", (level, preset, weeks, goal) => {
    expect(computeGoal(200, level, DPR_PRESETS[preset], weeks)).toBe(goal);
  });

  it("keeps the table ordered low < mid < high", () => {
    for (const row of Object.values(GOAL_TABLE)) {
      expect(row.low).toBeLessThan(row.mid);
      expect(row.mid).toBeLessThan(row.high);
    }
  });
});

describe("baseline, layoffs and on-track status", () => {
  const block = { startDate: day(0), weeks: 10, baselineE1rm: 200, goalE1rm: 220 };

  it("takes the best of the last 3 sessions before the block", () => {
    const series = [
      { date: day(-20), e1rm: 250 },
      { date: day(-9), e1rm: 195 },
      { date: day(-6), e1rm: 205 },
      { date: day(-3), e1rm: 200 },
      { date: day(1), e1rm: 300 },
    ];
    expect(baselineE1rm(series, day(0))).toBe(205);
    expect(baselineE1rm([], day(0))).toBeNull();
  });

  it("sums gaps of 14+ days", () => {
    expect(layoffDays([day(3), day(20), day(22)], day(0), day(50))).toBe(17 + 28);
    expect(layoffDays([day(3), day(10)], day(0), day(12))).toBe(0);
  });

  it("pushes the goal date back by the layoff", () => {
    expect(goalDate(block, 14)).toEqual(day(84));
  });

  it.each([
    // halfway (day 35): expected 210 → band 205.8–214.2
    [215, "ahead"],
    [214, "on_track"],
    [206, "on_track"],
    [205, "behind"],
  ] as const)("e1RM %s at halfway → %s", (e1rm, status) => {
    const series = [
      ...[3, 10, 17, 24, 31].map((n) => ({ date: day(n), e1rm: 150 })),
      { date: day(35), e1rm },
    ];
    expect(onTrackStatus(block, series, day(35))).toBe(status);
  });

  it("doesn't count a layoff as elapsed time", () => {
    // 20 days off in the middle: effective progress at day 35 is 15/70.
    const series = [
      { date: day(5), e1rm: 203 },
      { date: day(25), e1rm: 205 },
    ];
    expect(onTrackStatus(block, series, day(35))).toBe("on_track");
  });

  it("is on track with no sessions yet", () => {
    expect(onTrackStatus(block, [], day(3))).toBe("on_track");
  });
});

describe("focusCandidates", () => {
  const exercises = Array.from({ length: 13 }, (_, i) => ({
    id: `ex${i}`,
    name: `Exercise ${String(i).padStart(2, "0")}`,
    trackingType: i === 12 ? "time" : "weight_reps",
  }));

  it("ranks weighted lifts by sessions in the last 90 days, top 10", () => {
    const rows: { exerciseId: string; sessionId: string; startedAt: Date }[] = [];
    exercises.forEach((ex, i) => {
      for (let s = 0; s <= i; s++) {
        rows.push({ exerciseId: ex.id, sessionId: `s${s}`, startedAt: day(100 - s) });
      }
    });
    // Old sessions outside the window don't count.
    for (let s = 0; s < 50; s++) {
      rows.push({ exerciseId: "ex0", sessionId: `old${s}`, startedAt: day(-10 - s) });
    }
    const result = focusCandidates(rows, exercises, day(100));
    expect(result).toHaveLength(10);
    expect(result[0]?.exercise.id).toBe("ex11");
    expect(result.map((c) => c.exercise.id)).not.toContain("ex12");
    expect(result.map((c) => c.exercise.id)).not.toContain("ex0");
    expect(result[0]?.frequency).toBe(12);
  });

  it("includes weighted bodyweight and breaks ties by recency", () => {
    const result = focusCandidates(
      [
        { exerciseId: "a", sessionId: "1", startedAt: day(1) },
        { exerciseId: "b", sessionId: "2", startedAt: day(5) },
        { exerciseId: "c", sessionId: "3", startedAt: day(5) },
      ],
      [
        { id: "a", name: "A", trackingType: "weight_reps" },
        { id: "b", name: "B", trackingType: "weighted_bodyweight" },
        { id: "c", name: "C", trackingType: "bodyweight" },
      ],
      day(10),
    );
    expect(result.map((c) => c.exercise.id)).toEqual(["b", "a"]);
  });
});
