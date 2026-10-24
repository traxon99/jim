import { describe, expect, it } from "vitest";
import { highlightMatches } from "../search-highlight";

function marked(text: string, query: string): string {
  return highlightMatches(text, query)
    .map((part) => (part.match ? `[${part.text}]` : part.text))
    .join("");
}

describe("highlightMatches", () => {
  it("marks the whole phrase, ignoring case", () => {
    expect(marked("Barbell Bench Press", "bench press")).toBe("Barbell [Bench Press]");
  });

  it("marks every occurrence of a substring", () => {
    expect(marked("Pulldown Pullover", "pull")).toBe("[Pull]down [Pull]over");
    expect(marked("Lat Pulldown", "down")).toBe("Lat Pull[down]");
  });

  it("falls back to each word when the phrase isn't contiguous", () => {
    expect(marked("Incline Dumbbell Bench Press", "incline press")).toBe(
      "[Incline] Dumbbell Bench [Press]",
    );
  });

  it("ignores punctuation and spacing differences", () => {
    expect(marked("Push-Up", "push up")).toBe("[Push-Up]");
    expect(marked("T-Bar Row", "t bar")).toBe("[T-Bar] Row");
  });

  it("only matches short words at a word start", () => {
    expect(marked("Lat Pulldown", "a")).toBe("Lat Pulldown");
    expect(marked("Ab Rollout", "ab")).toBe("[Ab] Rollout");
  });

  it("leaves text alone for an empty query or no match", () => {
    expect(highlightMatches("Squat", "  ")).toEqual([{ text: "Squat", match: false }]);
    expect(marked("Squat", "sqaut")).toBe("Squat");
    expect(highlightMatches("", "squat")).toEqual([]);
  });
});
