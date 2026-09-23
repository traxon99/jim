import { describe, expect, it } from "vitest";
import { suggestedWeightsByTier, weightForTargetReps } from "../suggest-weight";

describe("weightForTargetReps", () => {
  it("returns the 1RM unchanged for a single rep", () => {
    expect(weightForTargetReps(225, 1)).toBe(225);
  });

  it("inverts the Epley formula", () => {
    // 262.5 / (1 + 5/30) = 225
    expect(weightForTargetReps(262.5, 5)).toBe(225);
  });

  it("returns 0 for non-positive inputs", () => {
    expect(weightForTargetReps(0, 5)).toBe(0);
    expect(weightForTargetReps(225, 0)).toBe(0);
  });
});

describe("suggestedWeightsByTier", () => {
  it("returns an ascending weight per tier at the given rep count", () => {
    const profile = { sex: "male" as const, bodyweight: 180, age: 25 };
    const suggestions = suggestedWeightsByTier("squat", profile, 5);

    expect(suggestions.beginner).toBeGreaterThan(0);
    expect(suggestions.novice).toBeGreaterThan(suggestions.beginner);
    expect(suggestions.intermediate).toBeGreaterThan(suggestions.novice);
    expect(suggestions.advanced).toBeGreaterThan(suggestions.intermediate);
    expect(suggestions.elite).toBeGreaterThan(suggestions.advanced);
  });

  it("scales down for higher rep counts than for a near-max single", () => {
    const profile = { sex: "male" as const, bodyweight: 180, age: 25 };
    const singleRep = suggestedWeightsByTier("squat", profile, 1);
    const fiveRep = suggestedWeightsByTier("squat", profile, 5);

    expect(fiveRep.intermediate).toBeLessThan(singleRep.intermediate);
  });
});
