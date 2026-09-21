import { describe, expect, it } from "vitest";
import { estimateOneRepMax } from "../../one-rep-max";
import {
  type EstimatedOneRepMaxSet,
  estimatedOneRepMaxSeries,
} from "../estimated-one-rep-max-series";

function set(overrides: Partial<EstimatedOneRepMaxSet> = {}): EstimatedOneRepMaxSet {
  return {
    sessionId: "session-1",
    completedAt: new Date("2026-01-01T00:00:00.000Z"),
    weight: 225,
    reps: 5,
    ...overrides,
  };
}

describe("estimatedOneRepMaxSeries", () => {
  it("computes one point per session, matching estimateOneRepMax by hand", () => {
    const points = estimatedOneRepMaxSeries([set()]);
    expect(points).toEqual([
      {
        date: set().completedAt,
        sessionId: "session-1",
        estimatedOneRepMax: estimateOneRepMax(225, 5),
      },
    ]);
  });

  it("takes the best set within a session, not the last one", () => {
    const points = estimatedOneRepMaxSeries([
      set({ weight: 225, reps: 5 }),
      set({ weight: 135, reps: 8 }), // lower e1RM, same session
    ]);
    expect(points).toHaveLength(1);
    expect(points[0]?.estimatedOneRepMax).toBe(estimateOneRepMax(225, 5));
  });

  it("sorts multiple sessions oldest first", () => {
    const points = estimatedOneRepMaxSeries([
      set({ sessionId: "later", completedAt: new Date("2026-02-01T00:00:00.000Z") }),
      set({ sessionId: "earlier", completedAt: new Date("2026-01-01T00:00:00.000Z") }),
    ]);
    expect(points.map((p) => p.sessionId)).toEqual(["earlier", "later"]);
  });

  it("ignores sets without both weight and reps", () => {
    const points = estimatedOneRepMaxSeries([set({ weight: null }), set({ reps: null })]);
    expect(points).toEqual([]);
  });

  it("returns an empty array for no sets", () => {
    expect(estimatedOneRepMaxSeries([])).toEqual([]);
  });
});
