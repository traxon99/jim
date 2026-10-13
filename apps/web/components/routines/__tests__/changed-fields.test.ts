import type { RoutineExerciseRow } from "@/lib/db/schema";
import { describe, expect, it } from "vitest";
import { changedFields } from "../routine-exercise-row";

const item = {
  targetSets: 3,
  targetRepsLow: 8,
  targetRepsHigh: 12,
  targetWeight: "135.00",
  notes: "pause at the bottom",
} as RoutineExerciseRow;

describe("changedFields (#519)", () => {
  it("writes nothing when a field is left unchanged", () => {
    expect(changedFields(item, { targetSets: 3 })).toBeNull();
    expect(changedFields(item, { targetWeight: "135" })).toBeNull();
    expect(changedFields(item, { notes: "pause at the bottom" })).toBeNull();
  });

  it("keeps only the fields that changed", () => {
    expect(changedFields(item, { targetRepsLow: 6, targetRepsHigh: 12 })).toEqual({
      targetRepsLow: 6,
    });
    expect(changedFields(item, { targetWeight: "140" })).toEqual({ targetWeight: "140" });
    expect(changedFields(item, { targetWeight: null })).toEqual({ targetWeight: null });
  });
});
