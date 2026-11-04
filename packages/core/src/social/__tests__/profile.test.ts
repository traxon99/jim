import { describe, expect, it } from "vitest";
import { bioError, displayNameError, normalizeBio, normalizeDisplayName } from "../profile";

describe("profile fields", () => {
  it("trims display name and bio", () => {
    expect(normalizeDisplayName("  Maya Chen  ")).toBe("Maya Chen");
    expect(normalizeBio("  lifter  ")).toBe("lifter");
  });

  it("enforces length limits", () => {
    expect(displayNameError("a".repeat(51))).toMatch(/50/);
    expect(bioError("b".repeat(161))).toMatch(/160/);
    expect(displayNameError("ok")).toBeNull();
  });
});
