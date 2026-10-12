import { describe, expect, it } from "vitest";
import { parseForce, parseLevel, parseMechanic } from "../enum-values";

describe("dataset enum parsing", () => {
  it("passes through valid values", () => {
    expect(parseMechanic("compound")).toBe("compound");
    expect(parseMechanic("isolation")).toBe("isolation");
    expect(parseForce("push")).toBe("push");
    expect(parseForce("pull")).toBe("pull");
    expect(parseForce("static")).toBe("static");
    expect(parseLevel("beginner")).toBe("beginner");
    expect(parseLevel("intermediate")).toBe("intermediate");
    expect(parseLevel("expert")).toBe("expert");
  });

  it("normalises case and whitespace", () => {
    expect(parseLevel(" Expert ")).toBe("expert");
  });

  it("nulls values outside the enum instead of throwing", () => {
    expect(parseMechanic("hybrid")).toBeNull();
    expect(parseForce("push-pull")).toBeNull();
    expect(parseLevel("advanced")).toBeNull();
    expect(parseLevel("")).toBeNull();
  });

  it("nulls missing or non-string values", () => {
    expect(parseMechanic(null)).toBeNull();
    expect(parseForce(undefined)).toBeNull();
    expect(parseLevel(3)).toBeNull();
  });
});
