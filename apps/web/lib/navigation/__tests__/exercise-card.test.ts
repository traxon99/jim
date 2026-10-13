import { describe, expect, it } from "vitest";
import { exerciseCardHref, exerciseCardReturnPath } from "../exercise-card";

describe("exercise card return path (#525)", () => {
  it("round-trips the page the card was opened from", () => {
    const href = exerciseCardHref("abc", "/history/123");
    expect(href).toBe("/exercises/abc?from=%2Fhistory%2F123");
    const from = new URL(href, "https://jim.test").searchParams.get("from") ?? undefined;
    expect(exerciseCardReturnPath(from)).toBe("/history/123");
  });

  it("ignores a missing or off-site return path", () => {
    expect(exerciseCardReturnPath(undefined)).toBeUndefined();
    expect(exerciseCardReturnPath("https://evil.example")).toBeUndefined();
    expect(exerciseCardReturnPath("//evil.example")).toBeUndefined();
    expect(exerciseCardReturnPath(["/history", "/home"])).toBeUndefined();
  });
});
