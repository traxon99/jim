import { describe, expect, it } from "vitest";
import { SETUP_STEPS, setupExitHref } from "../steps";

describe("setup steps", () => {
  it("asks in the order requested: gym, program, detail, PRP, then looks", () => {
    expect(SETUP_STEPS).toEqual(["welcome", "gym", "program", "features", "prp", "look"]);
  });

  it("returns to Settings when opened from there, else Home", () => {
    expect(setupExitHref("settings")).toBe("/profile/settings");
    expect(setupExitHref(null)).toBe("/home");
  });
});
