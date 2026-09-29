import { describe, expect, it } from "vitest";
import { REACTION_EMOJI, REACTION_KINDS, isReactionKind } from "../reactions";

describe("reactions", () => {
  it("has an emoji for every kind", () => {
    for (const kind of REACTION_KINDS) expect(REACTION_EMOJI[kind]).toBeTruthy();
  });

  it("recognises only the stored keys", () => {
    expect(isReactionKind("fire")).toBe(true);
    expect(isReactionKind("🔥")).toBe(false);
    expect(isReactionKind(undefined)).toBe(false);
  });
});
