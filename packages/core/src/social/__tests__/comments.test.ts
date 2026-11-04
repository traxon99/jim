import { describe, expect, it } from "vitest";
import { COMMENT_MAX_LENGTH, commentError, commentSegments, normalizeComment } from "../comments";

describe("normalizeComment / commentError", () => {
  it("trims, and refuses empty or overlong comments", () => {
    expect(normalizeComment("  nice  ")).toBe("nice");
    expect(normalizeComment("   ")).toBeNull();
    expect(commentError(null)).toMatch(/Write something/);
    expect(commentError("x".repeat(COMMENT_MAX_LENGTH + 1))).toMatch(/under/);
    expect(commentError("x".repeat(COMMENT_MAX_LENGTH))).toBeNull();
  });
});

describe("commentSegments", () => {
  const friends = new Set(["maya", "sam.lifts"]);

  it("keeps plain text whole", () => {
    expect(commentSegments("bar speed 👀", friends)).toEqual([
      { type: "text", text: "bar speed 👀" },
    ]);
  });

  it("links mentions of friends only", () => {
    expect(commentSegments("@maya and @stranger, ask sam.lifts @sam.lifts", friends)).toEqual([
      { type: "mention", username: "maya" },
      { type: "text", text: " and @stranger, ask sam.lifts " },
      { type: "mention", username: "sam.lifts" },
    ]);
  });

  it("doesn't treat an email-like @ as a mention", () => {
    expect(commentSegments("me@maya", friends)).toEqual([{ type: "text", text: "me@maya" }]);
  });

  it("turns typed PRP words into call marks", () => {
    expect(commentSegments("next week UP ↑ for sure", friends)).toEqual([
      { type: "text", text: "next week " },
      { type: "call", call: "increase" },
      { type: "text", text: " for sure" },
    ]);
  });
});
