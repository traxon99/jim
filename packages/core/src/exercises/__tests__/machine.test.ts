import { describe, expect, it } from "vitest";
import { MACHINE_TEXT_MAX, cleanMachineText, machineName } from "../machine";

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
