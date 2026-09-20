import { describe, expect, it } from "vitest";
import { classifyTrackingType } from "../tracking-type";

describe("classifyTrackingType", () => {
  it("classifies an equipment-based strength exercise as weight_reps", () => {
    expect(
      classifyTrackingType({
        name: "Barbell Bench Press",
        category: "strength",
        equipment: "barbell",
      }),
    ).toBe("weight_reps");
  });

  it("classifies a body-only strength exercise as bodyweight", () => {
    expect(
      classifyTrackingType({ name: "Push-Up", category: "strength", equipment: "body only" }),
    ).toBe("bodyweight");
  });

  it("classifies a null-equipment exercise as bodyweight", () => {
    expect(
      classifyTrackingType({ name: "Arm Circles", category: "strength", equipment: null }),
    ).toBe("bodyweight");
  });

  it("classifies stretching as time", () => {
    expect(
      classifyTrackingType({ name: "Cat Stretch", category: "stretching", equipment: "body only" }),
    ).toBe("time");
  });

  it("classifies cardio as distance", () => {
    expect(
      classifyTrackingType({ name: "Rowing, Stationary", category: "cardio", equipment: null }),
    ).toBe("distance");
  });

  it("classifies a named weighted-bodyweight movement over its category", () => {
    expect(
      classifyTrackingType({ name: "Weighted Pull Ups", category: "strength", equipment: null }),
    ).toBe("weighted_bodyweight");
  });

  it("does not misclassify equipment merely containing 'weighted' as a substring", () => {
    // e.g. a hypothetical "Unweighted Dip" should not match \bweighted\b
    expect(
      classifyTrackingType({
        name: "Unweighted Dip",
        category: "strength",
        equipment: "body only",
      }),
    ).toBe("bodyweight");
  });

  it("falls back to weight_reps for equipment it does not otherwise recognise", () => {
    expect(
      classifyTrackingType({ name: "Trap Bar Deadlift", category: "strength", equipment: "other" }),
    ).toBe("weight_reps");
  });
});
