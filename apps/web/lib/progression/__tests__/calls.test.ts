import type { DprHistoryEntry, ProgressionRule } from "@jim/core";
import { describe, expect, it } from "vitest";
import type { RoutineExerciseRow } from "../../db/schema";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import {
  ruleBadge,
  ruleCallFor,
  ruleOf,
  ruleRepsPlaceholder,
  ruleWeightPlaceholder,
  ruleWhyLine,
} from "../calls";

const SQUAT = "squat";
const day = (n: number) => new Date(Date.UTC(2026, 8, 1 + n));

function entry(n: number, weight: number, reps: number[]): DprHistoryEntry {
  return {
    exerciseId: SQUAT,
    repRange: { low: 6, high: 10 },
    date: day(n),
    sets: reps.map((r) => ({ kind: "working" as const, weight, reps: r, rpe: null })),
  };
}

const T1: ProgressionRule = {
  type: "linear",
  increment: 10,
  stages: [
    { sets: 5, reps: 3 },
    { sets: 6, reps: 2 },
    { sets: 10, reps: 1 },
  ],
  deload: { afterFailures: 1, pct: 0.15 },
};

function target(rule: ProgressionRule | null): RoutineExerciseRow {
  return {
    exerciseId: SQUAT,
    targetSets: 5,
    targetRepsLow: 3,
    targetRepsHigh: 3,
    targetWeight: "185.00",
    progressionRule: rule,
  } as RoutineExerciseRow;
}

function call(history: DprHistoryEntry[], rule: ProgressionRule | null = T1) {
  return ruleCallFor({
    snapshot: { history },
    exerciseId: SQUAT,
    target: target(rule),
    exercise: { equipment: "barbell" },
    settings: DEFAULT_SETTINGS,
  });
}

describe("custom progression rules in a workout (issue #255)", () => {
  it("has no call without a rule", () => {
    expect(call([], null)).toBeNull();
    expect(ruleOf({ progressionRule: { type: "nope" } as unknown as ProgressionRule })).toBeNull();
  });

  it("starts from the routine's target weight with no history", () => {
    const info = call([]);
    expect(ruleWeightPlaceholder(info, "working")).toBe("185");
    expect(ruleRepsPlaceholder(info, "working")).toBe("3");
    expect(info && ruleWhyLine(info, "lb")).toBe("Start at 5×3 @ 185 lb");
  });

  it("adds the increment after a hit and moves to the next scheme on a miss", () => {
    const up = call([entry(0, 200, [3, 3, 3, 3, 5])]);
    expect(ruleWeightPlaceholder(up, "working")).toBe("210");
    expect(ruleWeightPlaceholder(up, "warmup")).toBeNull();
    expect(up && ruleBadge(up)).toBe("Linear ↑");
    expect(up && ruleWhyLine(up, "lb")).toBe("Hit 3/3/3/3/5 @ 200 → 5×3 @ 210 lb");

    const stepped = call([entry(0, 200, [3, 3, 3, 3, 5]), entry(3, 210, [3, 3, 3, 3, 2])]);
    expect(stepped?.decision).toMatchObject({ weight: 210, targetSets: 6, targetReps: 2 });
    expect(stepped && ruleWhyLine(stepped, "lb")).toBe("Missed 5×3 — moving to 6×2 → 6×2 @ 210 lb");
  });
});
