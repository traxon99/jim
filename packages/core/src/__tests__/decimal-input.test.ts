import { describe, expect, it } from "vitest";
import { normalizeDecimalInput } from "../decimal-input";

describe("normalizeDecimalInput (#675)", () => {
  it("turns a decimal comma into a point", () => {
    expect(normalizeDecimalInput("62,5")).toBe("62.5");
    expect(Number(normalizeDecimalInput("62,5"))).toBe(62.5);
  });

  it("leaves point decimals, whole numbers and an empty field alone", () => {
    expect(normalizeDecimalInput("62.5")).toBe("62.5");
    expect(normalizeDecimalInput("100")).toBe("100");
    expect(normalizeDecimalInput("")).toBe("");
  });

  it("keeps a trailing comma mid-typing as a trailing point", () => {
    expect(normalizeDecimalInput("62,")).toBe("62.");
  });
});
