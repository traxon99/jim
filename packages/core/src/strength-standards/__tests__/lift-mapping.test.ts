import { describe, expect, it } from "vitest";
import { standardLiftForSlug } from "../lift-mapping";

describe("standardLiftForSlug", () => {
  it("maps the four canonical seed slugs to their standard lift", () => {
    expect(standardLiftForSlug("barbell-squat")).toBe("squat");
    expect(standardLiftForSlug("barbell-bench-press-medium-grip")).toBe("benchPress");
    expect(standardLiftForSlug("barbell-deadlift")).toBe("deadlift");
    expect(standardLiftForSlug("standing-military-press")).toBe("overheadPress");
  });

  it("returns null for an unmapped or missing slug", () => {
    expect(standardLiftForSlug("dumbbell-curl")).toBeNull();
    expect(standardLiftForSlug(null)).toBeNull();
    expect(standardLiftForSlug(undefined)).toBeNull();
  });
});
