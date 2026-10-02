import { describe, expect, it } from "vitest";
import { WEEKLY_SET_TARGETS, weeklySetStatus, weeklySetStatusByMuscle } from "../volume-targets";

describe("weeklySetStatus", () => {
  it("flags hypertrophy volume below, inside and above 10–20 sets", () => {
    expect(weeklySetStatus(9.5, "hypertrophy")).toBe("under");
    expect(weeklySetStatus(10, "hypertrophy")).toBe("within");
    expect(weeklySetStatus(20, "hypertrophy")).toBe("within");
    expect(weeklySetStatus(20.5, "hypertrophy")).toBe("over");
  });

  it("flags strength volume below, inside and above 5–10 sets", () => {
    expect(weeklySetStatus(4.5, "strength")).toBe("under");
    expect(weeklySetStatus(5, "strength")).toBe("within");
    expect(weeklySetStatus(10, "strength")).toBe("within");
    expect(weeklySetStatus(11, "strength")).toBe("over");
  });

  it("needs fewer sets for strength than for hypertrophy", () => {
    expect(WEEKLY_SET_TARGETS.strength.min).toBeLessThan(WEEKLY_SET_TARGETS.hypertrophy.min);
    expect(WEEKLY_SET_TARGETS.strength.max).toBeLessThanOrEqual(WEEKLY_SET_TARGETS.hypertrophy.min);
  });
});

describe("weeklySetStatusByMuscle", () => {
  it("classifies every muscle in the week", () => {
    expect(
      weeklySetStatusByMuscle({ chest: 3, quadriceps: 15, shoulders: 23 }, "hypertrophy"),
    ).toEqual({ chest: "under", quadriceps: "within", shoulders: "over" });
  });
});
