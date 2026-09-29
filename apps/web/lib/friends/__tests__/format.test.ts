import { describe, expect, it } from "vitest";
import { describeExercise, reactionButtons, withReaction, workoutMinutes } from "../format";

describe("describeExercise", () => {
  it("shows the heaviest set in the friend's units", () => {
    expect(describeExercise({ name: "Bench", sets: 3, topWeight: 185, topReps: 5 }, "lb")).toBe(
      "3 sets · top 185 lb × 5",
    );
  });

  it("falls back to reps for bodyweight work", () => {
    expect(describeExercise({ name: "Pull-up", sets: 1, topWeight: null, topReps: 12 }, "kg")).toBe(
      "1 set · best 12 reps",
    );
  });

  it("shows only the set count when nothing else was logged", () => {
    expect(describeExercise({ name: "Plank", sets: 2, topWeight: null, topReps: null }, "lb")).toBe(
      "2 sets",
    );
  });
});

describe("workoutMinutes", () => {
  it("rounds to whole minutes", () => {
    expect(
      workoutMinutes({ startedAt: "2026-09-28T10:00:00Z", endedAt: "2026-09-28T10:47:40Z" }),
    ).toBe(48);
  });

  it("never goes negative", () => {
    expect(
      workoutMinutes({ startedAt: "2026-09-28T11:00:00Z", endedAt: "2026-09-28T10:00:00Z" }),
    ).toBe(0);
  });
});

describe("reactions", () => {
  it("lists every kind in button order", () => {
    expect(reactionButtons([{ kind: "party", count: 2, mine: false }])).toEqual([
      { kind: "strong", count: 0, mine: false },
      { kind: "fire", count: 0, mine: false },
      { kind: "clap", count: 0, mine: false },
      { kind: "party", count: 2, mine: false },
    ]);
  });

  it("adds the user's reaction to a kind others already used", () => {
    expect(
      withReaction(
        [
          { kind: "party", count: 1, mine: false },
          { kind: "fire", count: 2, mine: false },
        ],
        "strong",
        true,
      ),
    ).toEqual([
      { kind: "strong", count: 1, mine: true },
      { kind: "fire", count: 2, mine: false },
      { kind: "party", count: 1, mine: false },
    ]);
    expect(withReaction([{ kind: "fire", count: 2, mine: false }], "fire", true)).toEqual([
      { kind: "fire", count: 3, mine: true },
    ]);
  });

  it("takes a reaction back, dropping a kind no one uses any more", () => {
    expect(withReaction([{ kind: "fire", count: 2, mine: true }], "fire", false)).toEqual([
      { kind: "fire", count: 1, mine: false },
    ]);
    expect(withReaction([{ kind: "fire", count: 1, mine: true }], "fire", false)).toEqual([]);
  });

  it("leaves reactions alone when nothing changes", () => {
    const reactions = [{ kind: "fire" as const, count: 1, mine: true }];
    expect(withReaction(reactions, "fire", true)).toBe(reactions);
  });
});
