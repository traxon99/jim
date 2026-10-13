import { describe, expect, it } from "vitest";
import { SET_LIMITS, setValuesProblem } from "../set-limits";

describe("setValuesProblem (#500)", () => {
  it("accepts values the server columns can hold", () => {
    expect(setValuesProblem({ weight: 225, reps: 5 })).toBeNull();
    expect(setValuesProblem({ weight: SET_LIMITS.weight, reps: null })).toBeNull();
    expect(setValuesProblem({ durationSeconds: 3600, distance: 42.2 })).toBeNull();
  });

  it("names the field that would overflow or is invalid", () => {
    expect(setValuesProblem({ weight: 100_000, reps: 5 })).toBe(
      "Weight can't be more than 99,999.99.",
    );
    expect(setValuesProblem({ reps: 12_000 })).toBe("Reps can't be more than 9,999.");
    expect(setValuesProblem({ weight: -5 })).toBe("Weight must be a positive number.");
    expect(setValuesProblem({ distance: Number.NaN })).toBe("Distance must be a positive number.");
  });
});
