import { describe, expect, it } from "vitest";
import { cmToFeetInches, feetInchesToCm } from "../height";

describe("cmToFeetInches", () => {
  it("converts a stored cm value to the nearest whole inch", () => {
    expect(cmToFeetInches("177.8")).toEqual({ feet: 5, inches: 10 });
    expect(cmToFeetInches(180)).toEqual({ feet: 5, inches: 11 });
  });

  it("carries 12 inches up into the next foot", () => {
    expect(cmToFeetInches(182.6)).toEqual({ feet: 6, inches: 0 });
  });

  it("returns null for empty or non-positive values", () => {
    expect(cmToFeetInches(null)).toBeNull();
    expect(cmToFeetInches("")).toBeNull();
    expect(cmToFeetInches("0")).toBeNull();
    expect(cmToFeetInches("abc")).toBeNull();
  });
});

describe("feetInchesToCm", () => {
  it("converts feet and inches to cm, rounded to one decimal", () => {
    expect(feetInchesToCm(5, 10)).toBe(177.8);
    expect(feetInchesToCm(6, 0)).toBe(182.9);
    expect(feetInchesToCm(5, 7.5)).toBe(171.5);
  });

  it("round-trips through cmToFeetInches", () => {
    for (let feet = 4; feet <= 7; feet++) {
      for (let inches = 0; inches < 12; inches++) {
        expect(cmToFeetInches(feetInchesToCm(feet, inches))).toEqual({ feet, inches });
      }
    }
  });

  it("rejects zero or negative heights", () => {
    expect(feetInchesToCm(0, 0)).toBeNull();
    expect(feetInchesToCm(-1, 5)).toBeNull();
    expect(feetInchesToCm(5, Number.NaN)).toBeNull();
  });
});
