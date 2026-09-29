import { describe, expect, it } from "vitest";
import { type RoutineTargets, routineItemSummary } from "../summary";

const EMPTY: RoutineTargets = {
  targetSets: null,
  targetRepsLow: null,
  targetRepsHigh: null,
  targetDurationSeconds: null,
  targetRestSeconds: null,
  targetWeight: null,
};

describe("routineItemSummary", () => {
  it("reads like '3 × 5–7 · 185 lb · 2:00 rest'", () => {
    expect(
      routineItemSummary(
        {
          ...EMPTY,
          targetSets: 3,
          targetRepsLow: 5,
          targetRepsHigh: 7,
          targetWeight: "185.00",
          targetRestSeconds: 120,
        },
        "lb",
      ),
    ).toBe("3 × 5–7 · 185 lb · 2:00 rest");
  });

  it("shows a single rep count when low and high match or one is missing", () => {
    expect(
      routineItemSummary({ ...EMPTY, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 8 }, "kg"),
    ).toBe("3 × 8");
    expect(routineItemSummary({ ...EMPTY, targetSets: 3, targetRepsHigh: 10 }, "kg")).toBe(
      "3 × 10",
    );
  });

  it("names sets or reps when only one is set", () => {
    expect(routineItemSummary({ ...EMPTY, targetSets: 4 }, "lb")).toBe("4 sets");
    expect(routineItemSummary({ ...EMPTY, targetSets: 1 }, "lb")).toBe("1 set");
    expect(routineItemSummary({ ...EMPTY, targetRepsLow: 8, targetRepsHigh: 12 }, "lb")).toBe(
      "8–12 reps",
    );
  });

  it("shows a timed warm-up's hold instead of reps", () => {
    expect(
      routineItemSummary({ ...EMPTY, targetSets: 2, targetDurationSeconds: 30 }, "lb", true),
    ).toBe("2 × 30s");
  });

  it("uses the user's units and short rests in seconds", () => {
    expect(
      routineItemSummary({ ...EMPTY, targetWeight: "102.5", targetRestSeconds: 45 }, "kg"),
    ).toBe("102.5 kg · 45s rest");
  });

  it("returns null when nothing is set", () => {
    expect(routineItemSummary(EMPTY, "lb")).toBeNull();
  });
});
