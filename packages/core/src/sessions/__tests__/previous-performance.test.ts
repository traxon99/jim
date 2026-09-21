import { describe, expect, it } from "vitest";
import { findPreviousSessionExerciseId, mapPreviousSetsByIndex } from "../previous-performance";

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
