import { describe, expect, it } from "vitest";
import { ageAdjustmentFactor } from "../age-adjustment";

describe("ageAdjustmentFactor", () => {
  it("applies no adjustment inside the 18-40 prime window", () => {
    expect(ageAdjustmentFactor(18)).toBe(1);
    expect(ageAdjustmentFactor(28)).toBe(1);
    expect(ageAdjustmentFactor(40)).toBe(1);
  });

  it("reduces the factor by 1% per year below 18", () => {
    expect(ageAdjustmentFactor(15)).toBe(0.97);
  });

  it("reduces the factor by 1% per year above 40", () => {
    expect(ageAdjustmentFactor(50)).toBe(0.9);
  });

  it("floors the factor at 0.5 for extreme ages", () => {
    expect(ageAdjustmentFactor(120)).toBe(0.5);
    expect(ageAdjustmentFactor(0)).toBe(1);
  });

  it("returns 1 (no adjustment) when age is missing", () => {
    expect(ageAdjustmentFactor(null)).toBe(1);
    expect(ageAdjustmentFactor(undefined)).toBe(1);
  });
});
