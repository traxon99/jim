import { describe, expect, it } from "vitest";
import { summarizeSession } from "../session-summary";

describe("summarizeSession", () => {
  it("sums volume across weight+reps sets only, and computes duration", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const endedAt = new Date("2026-01-01T00:45:00.000Z");
    const summary = summarizeSession(
      [
        { weight: 225, reps: 5 },
        { weight: 135, reps: 8 },
        { weight: null, reps: null }, // e.g. a time-based set, ignored
      ],
      startedAt,
      endedAt,
      2,
    );

    expect(summary).toEqual({
      totalVolume: 225 * 5 + 135 * 8,
      durationSeconds: 45 * 60,
      setCount: 3,
      prCount: 2,
    });
  });

  it("handles a session with no sets logged", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const endedAt = new Date("2026-01-01T00:01:00.000Z");
    expect(summarizeSession([], startedAt, endedAt)).toEqual({
      totalVolume: 0,
      durationSeconds: 60,
      setCount: 0,
      prCount: 0,
    });
  });
});
