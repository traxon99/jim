import { describe, expect, it } from "vitest";
import {
  findPreviousSessionExerciseId,
  mapPreviousSetsByIndex,
  prefillWeightForFirstSet,
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

describe("prefillWeightForFirstSet", () => {
  const previous = { setIndex: 0, kind: "working", weight: 135, reps: 5, completedAt: new Date() };

  it("fills the exercise's first set with last time's weight", () => {
    expect(prefillWeightForFirstSet(0, previous)).toBe("135");
  });

  it("leaves later sets empty since 'Repeat' already covers them", () => {
    expect(prefillWeightForFirstSet(1, previous)).toBe("");
  });

  it("leaves the first set empty when there's no history for it", () => {
    expect(prefillWeightForFirstSet(0, undefined)).toBe("");
  });

  it("leaves the first set empty when the prior set's weight is bodyweight (null)", () => {
    expect(prefillWeightForFirstSet(0, { ...previous, weight: null })).toBe("");
  });

  it("falls back to a progressive-overload target when there's no prior set at all", () => {
    expect(prefillWeightForFirstSet(0, undefined, 145)).toBe("145");
  });

  it("prefers last time's weight over the fallback when both are available", () => {
    expect(prefillWeightForFirstSet(0, previous, 145)).toBe("135");
  });

  it("ignores the fallback for sets after the first", () => {
    expect(prefillWeightForFirstSet(1, undefined, 145)).toBe("");
  });
});
