import { describe, expect, it } from "vitest";
import { currentProgressedWeight, suggestedWeeklyIncrement } from "../weekly-progression";

describe("suggestedWeeklyIncrement", () => {
  it("suggests a bigger jump for compound lifts in lb", () => {
    expect(suggestedWeeklyIncrement("compound", "lb")).toBe(5);
  });

  it("suggests a smaller jump for isolation lifts in lb", () => {
    expect(suggestedWeeklyIncrement("isolation", "lb")).toBe(2.5);
  });

  it("suggests a bigger jump for compound lifts in kg", () => {
    expect(suggestedWeeklyIncrement("compound", "kg")).toBe(2.5);
  });

  it("suggests a smaller jump for isolation lifts in kg", () => {
    expect(suggestedWeeklyIncrement("isolation", "kg")).toBe(1);
  });

  it("treats an unknown mechanic as conservatively as isolation", () => {
    expect(suggestedWeeklyIncrement(null, "lb")).toBe(2.5);
  });
});

describe("currentProgressedWeight", () => {
  const start = new Date("2026-01-01T00:00:00Z");

  it("returns the baseline when progression isn't configured", () => {
    const result = currentProgressedWeight(
      { targetWeight: 135, progressionIncrement: null, progressionStartedAt: null },
      new Date("2026-03-01T00:00:00Z"),
    );
    expect(result).toBe(135);
  });

  it("returns the baseline before a full week has elapsed", () => {
    const result = currentProgressedWeight(
      { targetWeight: 135, progressionIncrement: 5, progressionStartedAt: start },
      new Date("2026-01-05T00:00:00Z"),
    );
    expect(result).toBe(135);
  });

  it("adds one increment per full week elapsed", () => {
    const result = currentProgressedWeight(
      { targetWeight: 135, progressionIncrement: 5, progressionStartedAt: start },
      new Date("2026-01-22T00:00:00Z"), // 3 full weeks later
    );
    expect(result).toBe(150);
  });

  it("never goes backward for a now before the start date", () => {
    const result = currentProgressedWeight(
      { targetWeight: 135, progressionIncrement: 5, progressionStartedAt: start },
      new Date("2025-12-01T00:00:00Z"),
    );
    expect(result).toBe(135);
  });

  it("treats a zero increment as disabled", () => {
    const result = currentProgressedWeight(
      { targetWeight: 135, progressionIncrement: 0, progressionStartedAt: start },
      new Date("2026-03-01T00:00:00Z"),
    );
    expect(result).toBe(135);
  });
});
