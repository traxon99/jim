import { describe, expect, it } from "vitest";
import { isFocusExerciseComplete, resolveFocusedExerciseIndex } from "../focus-exercise";

describe("resolveFocusedExerciseIndex", () => {
  it("lands on 0 when there are no exercises", () => {
    expect(resolveFocusedExerciseIndex([])).toBe(0);
  });

  it("picks the first exercise with no sets logged yet when there's no target", () => {
    const candidates = [
      { loggedSetCount: 1, targetSetCount: null },
      { loggedSetCount: 0, targetSetCount: null },
      { loggedSetCount: 0, targetSetCount: null },
    ];
    expect(resolveFocusedExerciseIndex(candidates)).toBe(1);
  });

  it("picks the first exercise still short of its target set count", () => {
    const candidates = [
      { loggedSetCount: 5, targetSetCount: 5 },
      { loggedSetCount: 2, targetSetCount: 5 },
      { loggedSetCount: 0, targetSetCount: 5 },
    ];
    expect(resolveFocusedExerciseIndex(candidates)).toBe(1);
  });

  it("falls back to the last exercise once everything is at or past target", () => {
    const candidates = [
      { loggedSetCount: 5, targetSetCount: 5 },
      { loggedSetCount: 6, targetSetCount: 5 },
    ];
    expect(resolveFocusedExerciseIndex(candidates)).toBe(1);
  });
});

describe("isFocusExerciseComplete", () => {
  it("needs one logged set when there's no target", () => {
    expect(isFocusExerciseComplete({ loggedSetCount: 0, targetSetCount: null })).toBe(false);
    expect(isFocusExerciseComplete({ loggedSetCount: 1, targetSetCount: null })).toBe(true);
  });

  it("needs the target set count when one is set", () => {
    expect(isFocusExerciseComplete({ loggedSetCount: 2, targetSetCount: 3 })).toBe(false);
    expect(isFocusExerciseComplete({ loggedSetCount: 3, targetSetCount: 3 })).toBe(true);
    expect(isFocusExerciseComplete({ loggedSetCount: 4, targetSetCount: 3 })).toBe(true);
  });
});
