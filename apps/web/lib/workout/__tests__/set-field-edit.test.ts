import { describe, expect, it } from "vitest";
import { setFieldEditPatch } from "../set-field-edit";

const logged = { weight: "135.00", reps: 5, rpe: "8.0" };

describe("setFieldEditPatch", () => {
  it("changes only the edited value", () => {
    expect(setFieldEditPatch(logged, "weight", "140")).toEqual({ weight: 140, reps: 5, rpe: 8 });
    expect(setFieldEditPatch(logged, "reps", "6")).toEqual({ weight: 135, reps: 6, rpe: 8 });
    expect(setFieldEditPatch(logged, "rpe", "9.5")).toEqual({ weight: 135, reps: 5, rpe: 9.5 });
  });

  it("adds RPE to a set logged without one", () => {
    expect(setFieldEditPatch({ ...logged, rpe: null }, "rpe", "7")).toEqual({
      weight: 135,
      reps: 5,
      rpe: 7,
    });
  });

  it("clamps RPE into range", () => {
    expect(setFieldEditPatch(logged, "rpe", "12")?.rpe).toBe(10);
  });

  it("reverts empty or invalid input", () => {
    expect(setFieldEditPatch(logged, "weight", "")).toBeNull();
    expect(setFieldEditPatch(logged, "weight", "  ")).toBeNull();
    expect(setFieldEditPatch(logged, "weight", "abc")).toBeNull();
    expect(setFieldEditPatch(logged, "weight", "-5")).toBeNull();
    expect(setFieldEditPatch(logged, "reps", "5.5")).toBeNull();
  });

  it("saves nothing when the value didn't change", () => {
    expect(setFieldEditPatch(logged, "weight", "135")).toBeNull();
    expect(setFieldEditPatch(logged, "rpe", "8")).toBeNull();
  });
});
