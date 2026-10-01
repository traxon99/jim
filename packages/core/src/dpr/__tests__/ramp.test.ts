import { describe, expect, it } from "vitest";
import { rampWeights, workingSetWeights } from "../ramp";

describe("rampWeights", () => {
  it.each([
    [190, 1, 2.5, [190]],
    [190, 2, 2.5, [180, 190]],
    [190, 3, 2.5, [170, 180, 190]],
    [190, 5, 2.5, [170, 170, 170, 180, 190]],
    [50, 3, 5, [45, 50, 50]],
    [20, 3, 5, [20, 20, 20]],
  ] as const)("%s × %s sets (step %s) → %j", (top, count, step, expected) => {
    expect(rampWeights(top, count, step)).toEqual(expected);
  });

  it("never decreases and ends at the top weight", () => {
    for (const top of [45, 97.5, 135, 225, 315]) {
      const weights = rampWeights(top, 4, 5);
      expect(weights.at(-1)).toBe(top);
      for (let i = 1; i < weights.length; i++) {
        expect(weights[i]).toBeGreaterThanOrEqual(weights[i - 1] as number);
      }
    }
  });

  it("is empty for no sets", () => {
    expect(rampWeights(190, 0, 2.5)).toEqual([]);
  });
});

describe("workingSetWeights", () => {
  it("ramps a progression call", () => {
    expect(workingSetWeights({ call: "increase", weight: 200 }, 3, 2.5)).toEqual([180, 190, 200]);
  });

  it("keeps a light day flat", () => {
    expect(workingSetWeights({ call: "light", weight: 160 }, 3, 2.5)).toEqual([160, 160, 160]);
  });

  it("is empty with no weight", () => {
    expect(workingSetWeights({ call: "insufficient", weight: null }, 3, 2.5)).toEqual([]);
  });
});
