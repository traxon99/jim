import { describe, expect, it } from "vitest";
import { RPE_MAX, RPE_MIN, clampRpe } from "../rpe";

describe("clampRpe", () => {
  it("leaves in-range values untouched", () => {
    expect(clampRpe(7)).toBe(7);
    expect(clampRpe(7.5)).toBe(7.5);
  });

  it("clamps below RPE_MIN up to RPE_MIN", () => {
    expect(clampRpe(1)).toBe(RPE_MIN);
    expect(clampRpe(0)).toBe(RPE_MIN);
  });

  it("clamps above RPE_MAX down to RPE_MAX", () => {
    expect(clampRpe(12)).toBe(RPE_MAX);
  });
});
