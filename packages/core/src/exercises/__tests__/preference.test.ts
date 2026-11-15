import { describe, expect, it } from "vitest";
import { buildExercisePreferenceMap, isPickable, orderByPreference } from "../preference";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 15, 12, minute));

describe("buildExercisePreferenceMap", () => {
  it("keeps the newest row per slug and drops tombstones", () => {
    const map = buildExercisePreferenceMap([
      { exerciseSlug: "squat", preference: "dislike", updatedAt: at(1), deletedAt: null },
      { exerciseSlug: "squat", preference: "like", updatedAt: at(2), deletedAt: null },
      { exerciseSlug: "bench", preference: "like", updatedAt: at(1), deletedAt: null },
      { exerciseSlug: "bench", preference: "like", updatedAt: at(3), deletedAt: at(3) },
      { exerciseSlug: "row", preference: "meh", updatedAt: at(1), deletedAt: null },
    ]);
    expect([...map]).toEqual([["squat", "like"]]);
  });

  it("lets the live row win a tie with a tombstone, in either order", () => {
    const tombstone = {
      id: "01",
      exerciseSlug: "squat",
      preference: "dislike",
      updatedAt: at(5),
      deletedAt: at(5),
    };
    const live = {
      id: "02",
      exerciseSlug: "squat",
      preference: "like",
      updatedAt: at(5),
      deletedAt: null,
    };
    expect(buildExercisePreferenceMap([tombstone, live]).get("squat")).toBe("like");
    expect(buildExercisePreferenceMap([live, tombstone]).get("squat")).toBe("like");
  });
});

describe("orderByPreference", () => {
  it("puts likes first and dislikes last, keeping order otherwise", () => {
    const rows = ["a", "b", "c", "d", "e"].map((slug) => ({ slug }));
    const prefs = new Map([
      ["b", "dislike"],
      ["d", "like"],
      ["e", "like"],
    ] as const);
    expect(orderByPreference(rows, prefs).map((row) => row.slug)).toEqual([
      "d",
      "e",
      "a",
      "c",
      "b",
    ]);
  });
});

describe("isPickable", () => {
  it("is false only for a dislike", () => {
    const prefs = new Map([["a", "dislike"]] as const);
    expect(isPickable(prefs, "a")).toBe(false);
    expect(isPickable(prefs, "b")).toBe(true);
    expect(isPickable(undefined, "a")).toBe(true);
  });
});
