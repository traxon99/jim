import { describe, expect, it } from "vitest";
import { isLastRemainingSet, isWorkoutComplete, remainingPlannedSetCount } from "../last-set";

describe("remainingPlannedSetCount", () => {
  it("counts the target's unlogged sets", () => {
    expect(remainingPlannedSetCount(3, 0, new Set([0]))).toBe(2);
    expect(remainingPlannedSetCount(3, 0, new Set([0, 1, 2]))).toBe(0);
  });

  it("uses last time's set count when it's bigger than the target", () => {
    expect(remainingPlannedSetCount(3, 5, new Set([0, 1, 2]))).toBe(2);
  });

  it("plans one set when there's no target or history", () => {
    expect(remainingPlannedSetCount(null, 0, new Set())).toBe(1);
    expect(remainingPlannedSetCount(null, 0, new Set([0]))).toBe(0);
  });

  it("stays at zero for sets logged past the plan", () => {
    expect(remainingPlannedSetCount(2, 0, new Set([0, 1, 2]))).toBe(0);
  });
});

describe("isLastRemainingSet", () => {
  it("is true when the logged exercise is done and every other exercise is too", () => {
    const others = [
      { loggedSetCount: 3, targetSetCount: 3 },
      { loggedSetCount: 1, targetSetCount: null },
    ];
    expect(isLastRemainingSet(0, others)).toBe(true);
  });

  it("is true for a single-exercise workout once its sets are done", () => {
    expect(isLastRemainingSet(0, [])).toBe(true);
  });

  it("is false while the logged exercise still has sets left", () => {
    expect(isLastRemainingSet(1, [{ loggedSetCount: 3, targetSetCount: 3 }])).toBe(false);
  });

  it("is false for the last set of a non-final exercise", () => {
    const others = [{ loggedSetCount: 0, targetSetCount: 3 }];
    expect(isLastRemainingSet(0, others)).toBe(false);
  });

  it("is false once a new, empty exercise is added", () => {
    const others = [
      { loggedSetCount: 3, targetSetCount: 3 },
      { loggedSetCount: 0, targetSetCount: null },
    ];
    expect(isLastRemainingSet(0, others)).toBe(false);
  });
});

describe("isWorkoutComplete", () => {
  it("is true once every exercise has its planned sets logged", () => {
    const exercises = [
      { loggedSetCount: 3, targetSetCount: 3 },
      { loggedSetCount: 1, targetSetCount: null },
    ];
    expect(isWorkoutComplete(exercises)).toBe(true);
  });

  it("is false while any exercise still has sets left", () => {
    const exercises = [
      { loggedSetCount: 3, targetSetCount: 3 },
      { loggedSetCount: 2, targetSetCount: 3 },
    ];
    expect(isWorkoutComplete(exercises)).toBe(false);
  });

  it("is false for an exercise with no target and nothing logged", () => {
    expect(isWorkoutComplete([{ loggedSetCount: 0, targetSetCount: null }])).toBe(false);
  });

  it("is false for an empty workout", () => {
    expect(isWorkoutComplete([])).toBe(false);
  });
});
