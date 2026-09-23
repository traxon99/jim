import { describe, expect, it } from "vitest";
import { ageFromBirthdate } from "../age";

describe("ageFromBirthdate", () => {
  it("computes whole years elapsed", () => {
    expect(ageFromBirthdate("1990-06-15", new Date("2026-06-15T00:00:00Z"))).toBe(36);
  });

  it("has not yet had this year's birthday", () => {
    expect(ageFromBirthdate("1990-06-15", new Date("2026-06-14T00:00:00Z"))).toBe(35);
  });

  it("just had this year's birthday", () => {
    expect(ageFromBirthdate("1990-06-15", new Date("2026-06-16T00:00:00Z"))).toBe(36);
  });
});
