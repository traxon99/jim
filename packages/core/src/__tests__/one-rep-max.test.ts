import { describe, expect, it } from "vitest";
import { estimateOneRepMax } from "../one-rep-max";

describe("estimateOneRepMax", () => {
  it("returns the weight unchanged for a single rep", () => {
    expect(estimateOneRepMax(225, 1)).toBe(225);
  });

  it("estimates with the Epley formula by default", () => {
    // 225 * (1 + 5/30) = 262.5
    expect(estimateOneRepMax(225, 5)).toBe(262.5);
  });

  it("estimates with the Brzycki formula when requested", () => {
    // 225 * 36 / (37 - 5) = 253.125
    expect(estimateOneRepMax(225, 5, { formula: "brzycki" })).toBe(253.13);
  });

  it("returns 0 for non-positive weight or reps", () => {
    expect(estimateOneRepMax(0, 5)).toBe(0);
    expect(estimateOneRepMax(225, 0)).toBe(0);
    expect(estimateOneRepMax(-10, 5)).toBe(0);
  });
});
