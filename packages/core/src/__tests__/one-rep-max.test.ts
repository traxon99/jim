import { describe, expect, it } from "vitest";
import { MAX_ESTIMATE_REPS, estimateOneRepMax } from "../one-rep-max";

describe("estimateOneRepMax", () => {
  it("returns the weight unchanged for a single rep", () => {
    expect(estimateOneRepMax(225, 1)).toBe(225);
  });

  it("estimates with the Epley formula by default", () => {
    // 225 * (1 + 5/30) = 262.5
    expect(estimateOneRepMax(225, 5)).toBe(262.5);
  });

  it("stops counting reps past MAX_ESTIMATE_REPS (#538)", () => {
    // 20 × 50 used to estimate 53.33 and beat a real 50 kg single.
    expect(estimateOneRepMax(20, 50)).toBe(30);
    expect(estimateOneRepMax(20, 50)).toBe(estimateOneRepMax(20, MAX_ESTIMATE_REPS));
    expect(estimateOneRepMax(20, 50)).toBeLessThan(50);
  });

  it("can be left uncapped", () => {
    expect(estimateOneRepMax(30, 20, { maxReps: Number.POSITIVE_INFINITY })).toBe(50);
  });

  it("returns 0 for non-positive weight or reps", () => {
    expect(estimateOneRepMax(0, 5)).toBe(0);
    expect(estimateOneRepMax(225, 0)).toBe(0);
    expect(estimateOneRepMax(-10, 5)).toBe(0);
  });
});
