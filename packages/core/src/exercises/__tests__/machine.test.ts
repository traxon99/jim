import { describe, expect, it } from "vitest";
import { MACHINE_TEXT_MAX, cleanMachineText, exerciseDisplayName, machineName } from "../machine";

describe("machine details (#450)", () => {
  it("joins make and model, skipping blanks", () => {
    expect(machineName({ machineBrand: "Hammer Strength", machineModel: "Iso-Lateral Row" })).toBe(
      "Hammer Strength Iso-Lateral Row",
    );
    expect(machineName({ machineBrand: " ", machineModel: "Selectorized Pulldown" })).toBe(
      "Selectorized Pulldown",
    );
    expect(machineName({ machineBrand: null, machineModel: undefined })).toBeNull();
  });

  it("trims, caps and blanks text fields", () => {
    expect(cleanMachineText("  Life Fitness ")).toBe("Life Fitness");
    expect(cleanMachineText("")).toBeNull();
    expect(cleanMachineText(null)).toBeNull();
    expect(cleanMachineText("x".repeat(200))).toHaveLength(MACHINE_TEXT_MAX);
  });
});

describe("exerciseDisplayName (#460)", () => {
  it("puts the make and model after the name", () => {
    expect(
      exerciseDisplayName({
        name: "Lat Pulldown",
        machineBrand: "Hammer Strength",
        machineModel: "Iso-Lateral",
      }),
    ).toBe("Lat Pulldown (Hammer Strength Iso-Lateral)");
    expect(exerciseDisplayName({ name: "Seated Row", machineModel: "Selectorized" })).toBe(
      "Seated Row (Selectorized)",
    );
  });

  it("leaves the name alone with no machine, or when it already says it", () => {
    expect(exerciseDisplayName({ name: "Squat" })).toBe("Squat");
    expect(exerciseDisplayName({ name: "Squat", machineBrand: " " })).toBe("Squat");
    expect(
      exerciseDisplayName({ name: "Hammer Strength Row", machineBrand: "hammer strength" }),
    ).toBe("Hammer Strength Row");
  });
});
