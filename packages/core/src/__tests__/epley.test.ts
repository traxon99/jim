import { describe, expect, it } from "vitest";
import { epleyRepsToFailure, epleyWeightForReps } from "../epley";
import { estimateOneRepMax } from "../one-rep-max";

describe("Epley inverses", () => {
  it("round-trip the e1RM estimateOneRepMax gives", () => {
    const e1rm = estimateOneRepMax(225, 5);
    expect(epleyWeightForReps(e1rm, 5)).toBeCloseTo(225, 1);
    expect(epleyRepsToFailure(e1rm, 225)).toBeCloseTo(5, 1);
  });
});
