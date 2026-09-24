import { describe, expect, it } from "vitest";
import {
  findPreviousSessionExerciseId,
  mapPreviousSetsByIndex,
  plannedSetIndices,
  prefillWeightForSet,
} from "../previous-performance";

describe("mapPreviousSetsByIndex", () => {
  it("indexes sets by their position in the exercise", () => {
    const set0 = { setIndex: 0, kind: "working", weight: 135, reps: 5, completedAt: new Date() };
    const set1 = { setIndex: 1, kind: "working", weight: 145, reps: 5, completedAt: new Date() };
    const byIndex = mapPreviousSetsByIndex([set0, set1]);

    expect(byIndex.get(0)).toBe(set0);
    expect(byIndex.get(1)).toBe(set1);
    expect(byIndex.get(2)).toBeUndefined();
  });

  it("is empty for no prior sets", () => {
    expect(mapPreviousSetsByIndex([]).size).toBe(0);
  });
});

describe("findPreviousSessionExerciseId", () => {
  it("picks the most recent session_exercise that isn't the current session", () => {
    const result = findPreviousSessionExerciseId(
      [
        { id: "se-old", sessionId: "s-old", startedAt: new Date("2026-01-01") },
        { id: "se-recent", sessionId: "s-recent", startedAt: new Date("2026-01-10") },
        { id: "se-current", sessionId: "s-current", startedAt: new Date("2026-01-15") },
      ],
      "s-current",
    );
    expect(result).toBe("se-recent");
  });

  it("returns null when there's no prior session for this exercise", () => {
    const result = findPreviousSessionExerciseId(
      [{ id: "se-current", sessionId: "s-current", startedAt: new Date() }],
      "s-current",
    );
    expect(result).toBeNull();
  });
});

describe("prefillWeightForSet", () => {
  const previous = { setIndex: 0, kind: "working", weight: 135, reps: 5, completedAt: new Date() };

  it("fills the exercise's first set with last time's weight", () => {
    expect(prefillWeightForSet(0, previous)).toBe("135");
  });

  it("fills later sets with last time's weight at that same position too", () => {
    const previousSet2 = { ...previous, setIndex: 1, weight: 145 };
    expect(prefillWeightForSet(1, previousSet2)).toBe("145");
  });

  it("leaves the first set empty when there's no history for it", () => {
    expect(prefillWeightForSet(0, undefined)).toBe("");
  });

  it("leaves a set empty when the prior set's weight is bodyweight (null)", () => {
    expect(prefillWeightForSet(0, { ...previous, weight: null })).toBe("");
  });

  it("falls back to a progressive-overload target when there's no prior set at all", () => {
    expect(prefillWeightForSet(0, undefined, 145)).toBe("145");
  });

  it("prefers last time's weight over the fallback when both are available", () => {
    expect(prefillWeightForSet(0, previous, 145)).toBe("135");
  });

  it("ignores the fallback for sets after the first, which have nothing to fall back on", () => {
    expect(prefillWeightForSet(1, undefined, 145)).toBe("");
  });
});

describe("plannedSetIndices", () => {
  it("plans one row per target set when there's no history yet", () => {
    expect(plannedSetIndices(3, 0, new Set())).toEqual([0, 1, 2]);
  });

  it("plans one row per set logged last time when there's no target", () => {
    expect(plannedSetIndices(null, 4, new Set())).toEqual([0, 1, 2, 3]);
  });

  it("takes whichever of target and history calls for more rows", () => {
    expect(plannedSetIndices(2, 5, new Set())).toEqual([0, 1, 2, 3, 4]);
    expect(plannedSetIndices(5, 2, new Set())).toEqual([0, 1, 2, 3, 4]);
  });

  it("omits rows that are already logged", () => {
    expect(plannedSetIndices(3, 0, new Set([0]))).toEqual([1, 2]);
  });

  it("still offers one more row past the plan once every planned set is logged", () => {
    expect(plannedSetIndices(2, 0, new Set([0, 1]))).toEqual([2]);
  });

  it("keeps a gap open rather than hiding it when a later set was logged out of order", () => {
    expect(plannedSetIndices(3, 0, new Set([2]))).toEqual([0, 1]);
  });

  it("plans exactly one row with neither a target, history, nor any logged sets", () => {
    expect(plannedSetIndices(null, 0, new Set())).toEqual([0]);
  });
});
