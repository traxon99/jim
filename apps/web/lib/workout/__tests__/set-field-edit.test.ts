import { describe, expect, it } from "vitest";
import { formatSetValue, setFieldEditPatch } from "../set-field-edit";

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

  it("saves nothing for a value the server can't store (#500)", () => {
    expect(setFieldEditPatch(logged, "weight", "100000")).toBeNull();
    expect(setFieldEditPatch(logged, "reps", "12000")).toBeNull();
  });
});

describe("formatSetValue", () => {
  it("drops the trailing zeros synced values carry", () => {
    expect(formatSetValue("100.00")).toBe("100");
    expect(formatSetValue("110.50")).toBe("110.5");
    expect(formatSetValue("10.0")).toBe("10");
    expect(formatSetValue("7.5")).toBe("7.5");
    expect(formatSetValue(90)).toBe("90");
  });

  it("formats values logged on the phone and synced ones the same way", () => {
    expect(formatSetValue("135.00")).toBe(formatSetValue(135));
  });

  it("keeps at most two decimals", () => {
    expect(formatSetValue(102.499999)).toBe("102.5");
    expect(formatSetValue("22.68")).toBe("22.68");
  });

  it("shows nothing for a missing value", () => {
    expect(formatSetValue(null)).toBe("");
    expect(formatSetValue("")).toBe("");
  });
});
