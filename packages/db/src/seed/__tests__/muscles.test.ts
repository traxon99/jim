import { describe, expect, it } from "vitest";
import { normalizeMuscle, normalizeMuscles } from "../muscles";

describe("normalizeMuscle", () => {
  it("passes through a value already in the controlled vocabulary", () => {
    expect(normalizeMuscle("hamstrings")).toBe("hamstrings");
  });

  it("lowercases and trims", () => {
    expect(normalizeMuscle(" Chest ")).toBe("chest");
  });

  it("rejects a value outside the controlled vocabulary", () => {
    expect(() => normalizeMuscle("obliques")).toThrow(/controlled vocabulary/);
  });
});

describe("normalizeMuscles", () => {
  it("maps every entry", () => {
    expect(normalizeMuscles(["Glutes", "quadriceps"])).toEqual(["glutes", "quadriceps"]);
  });

  it("returns an empty array for no secondary muscles", () => {
    expect(normalizeMuscles([])).toEqual([]);
  });
});
