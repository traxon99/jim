import { describe, expect, it } from "vitest";
import { painAtFraction } from "../pain";

describe("painAtFraction (#856)", () => {
  it("gives each level an equal slice of the row", () => {
    expect(painAtFraction(0)).toBe(0);
    expect(painAtFraction(0.05)).toBe(0);
    expect(painAtFraction(1 / 11 + 0.001)).toBe(1);
    expect(painAtFraction(0.5)).toBe(5);
    expect(painAtFraction(0.95)).toBe(10);
  });

  it("clamps points past either edge", () => {
    expect(painAtFraction(-0.3)).toBe(0);
    expect(painAtFraction(1)).toBe(10);
    expect(painAtFraction(1.4)).toBe(10);
  });

  it("treats a bad measurement as no pain", () => {
    expect(painAtFraction(Number.NaN)).toBe(0);
  });
});
