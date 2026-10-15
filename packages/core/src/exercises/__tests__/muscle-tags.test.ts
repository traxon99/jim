import { describe, expect, it } from "vitest";
import { MISSING_PRIMARY_MUSCLE_ERROR, muscleTagsError, withoutPrimary } from "../muscles";

describe("muscle tags (#643)", () => {
  it("requires a primary muscle on a strength exercise", () => {
    expect(muscleTagsError("strength", [])).toBe(MISSING_PRIMARY_MUSCLE_ERROR);
    expect(muscleTagsError("strength", ["chest"])).toBeNull();
  });

  it("reads a missing category as strength", () => {
    expect(muscleTagsError(undefined, [])).toBe(MISSING_PRIMARY_MUSCLE_ERROR);
    expect(muscleTagsError(null, [])).toBe(MISSING_PRIMARY_MUSCLE_ERROR);
  });

  it("lets warm-ups and cardio stay untagged, since they don't count toward volume", () => {
    expect(muscleTagsError("warmup", [])).toBeNull();
    expect(muscleTagsError("cardio", [])).toBeNull();
  });

  it("drops a secondary muscle that is already primary", () => {
    expect(withoutPrimary(["shoulders", "chest", "triceps"], ["chest"])).toEqual([
      "shoulders",
      "triceps",
    ]);
    expect(withoutPrimary([], ["chest"])).toEqual([]);
  });
});
