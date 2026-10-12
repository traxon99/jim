import { describe, expect, it } from "vitest";
import { safeNextPath } from "../install-gate-exempt";

describe("safeNextPath", () => {
  it("keeps a same-origin path", () => {
    expect(safeNextPath("/history?tab=prs")).toBe("/history?tab=prs");
  });

  it.each([
    ["missing", undefined],
    ["an array", ["/a", "/b"]],
    ["a full URL", "https://evil.example"],
    ["a protocol-relative URL", "//evil.example"],
    ["a backslash URL", "/\\evil.example"],
    ["a tab that browsers strip", "/\t/evil.example"],
    ["a newline that browsers strip", "/\n/evil.example"],
    ["a javascript: URL", "javascript:alert(1)"],
  ])("falls back to / for %s", (_label, value) => {
    expect(safeNextPath(value)).toBe("/");
  });
});
