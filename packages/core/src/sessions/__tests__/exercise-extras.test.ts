import { describe, expect, it } from "vitest";
import { WARMUP_RAMP_SET_COUNT, resolveStickyNote, warmupRamp } from "../exercise-extras";

describe("warmupRamp", () => {
  it("ramps 40/60/80% of the working weight, rounded down to the increment", () => {
    expect(warmupRamp(225, 45, 5)).toEqual([
      { weight: 90, reps: 5 },
      { weight: 135, reps: 3 },
      { weight: 180, reps: 2 },
    ]);
    expect(warmupRamp(100, 20, 2.5)).toEqual([
      { weight: 40, reps: 5 },
      { weight: 60, reps: 3 },
      { weight: 80, reps: 2 },
    ]);
  });

  it("never goes below the empty bar", () => {
    expect(warmupRamp(95, 45, 5).map((set) => set.weight)).toEqual([45, 55, 75]);
  });

  it("doesn't exceed a working weight lighter than the bar", () => {
    expect(warmupRamp(30, 45, 5).map((set) => set.weight)).toEqual([30, 30, 30]);
  });

  it("suggests only reps with no working weight", () => {
    expect(warmupRamp(null, 45, 5)).toEqual([
      { weight: null, reps: 5 },
      { weight: null, reps: 3 },
      { weight: null, reps: 2 },
    ]);
    expect(warmupRamp(null, 45, 5)).toHaveLength(WARMUP_RAMP_SET_COUNT);
  });
});

describe("resolveStickyNote", () => {
  const older = { stickyNote: "Seat on 4", startedAt: new Date("2026-09-01") };
  const newer = { stickyNote: "Seat on 5", startedAt: new Date("2026-09-08") };

  it("prefers the workout's own note", () => {
    expect(resolveStickyNote("Grip wide", [older, newer])).toBe("Grip wide");
  });

  it("treats an own empty note as cleared", () => {
    expect(resolveStickyNote("", [older, newer])).toBeNull();
  });

  it("inherits the newest earlier note", () => {
    expect(resolveStickyNote(null, [newer, older])).toBe("Seat on 5");
    expect(resolveStickyNote(null, [older, newer])).toBe("Seat on 5");
  });

  it("skips workouts that never touched it, but honours one that cleared it", () => {
    const untouched = { stickyNote: null, startedAt: new Date("2026-09-15") };
    expect(resolveStickyNote(null, [older, untouched])).toBe("Seat on 4");
    const cleared = { stickyNote: " ", startedAt: new Date("2026-09-15") };
    expect(resolveStickyNote(null, [older, cleared])).toBeNull();
  });

  it("is null with no history", () => {
    expect(resolveStickyNote(null, [])).toBeNull();
  });
});
