import { describe, expect, it } from "vitest";
import { type SearchableRoutine, searchRoutines } from "../search";

function routine(name: string, overrides: Partial<SearchableRoutine> = {}): SearchableRoutine {
  return { id: name, name, folder: null, notes: null, ...overrides };
}

function names(results: readonly SearchableRoutine[]): string[] {
  return results.map((result) => result.name);
}

describe("searchRoutines", () => {
  const routines = [
    routine("Push Day", { folder: "Push/Pull/Legs" }),
    routine("Pull Day", { folder: "Push/Pull/Legs" }),
    routine("Leg Day", { folder: "Push/Pull/Legs" }),
    routine("Upper Body", { folder: "Upper/Lower", notes: "Heavy week" }),
    routine("Lower Body", { folder: "Upper/Lower" }),
    routine("Full Body Conditioning"),
  ];

  it("returns every routine in its given order for a blank query", () => {
    expect(names(searchRoutines(routines, "  "))).toEqual(names(routines));
  });

  it("drops routines that don't match", () => {
    expect(names(searchRoutines(routines, "leg"))).toEqual(["Leg Day", "Push Day", "Pull Day"]);
  });

  it("matches whole words anywhere in the name", () => {
    expect(names(searchRoutines(routines, "body"))).toEqual([
      "Upper Body",
      "Lower Body",
      "Full Body Conditioning",
    ]);
    // "pull" is one typo from "full" — kept, but ranked below the real match.
    expect(names(searchRoutines(routines, "full"))).toEqual([
      "Full Body Conditioning",
      "Pull Day",
      "Push Day",
      "Leg Day",
    ]);
  });

  it("tolerates typos", () => {
    expect(names(searchRoutines(routines, "uper body"))).toEqual(["Upper Body"]);
    expect(names(searchRoutines(routines, "conditoning"))).toEqual(["Full Body Conditioning"]);
  });

  it("ignores spacing and punctuation", () => {
    expect(names(searchRoutines(routines, "pushday"))).toEqual(["Push Day"]);
    expect(names(searchRoutines(routines, "push-day"))).toEqual(["Push Day"]);
    expect(names(searchRoutines(routines, "PUSH  day"))).toEqual(["Push Day"]);
  });

  it("matches word prefixes out of order", () => {
    expect(names(searchRoutines(routines, "bod upp"))).toEqual(["Upper Body"]);
  });

  it("matches the folder below any name match", () => {
    // "Upper/Lower" folder matches both, but the names rank first.
    expect(names(searchRoutines(routines, "upper"))).toEqual(["Upper Body", "Lower Body"]);
    expect(names(searchRoutines(routines, "ppl"))).toEqual([]);
  });

  it("matches the exercises in a routine", () => {
    const exercises = new Map([
      ["Push Day", ["Barbell Bench Press", "Overhead Press"]],
      ["Upper Body", ["Dumbbell Bench Press", "Pull-Up"]],
    ]);
    expect(names(searchRoutines(routines, "bench", exercises))).toEqual(["Push Day", "Upper Body"]);
    expect(names(searchRoutines(routines, "db bench", exercises))).toEqual(["Upper Body"]);
    // A name match still wins over an exercise match.
    expect(names(searchRoutines(routines, "pull", exercises))).toEqual([
      "Pull Day",
      "Push Day",
      "Leg Day",
      "Upper Body",
      "Full Body Conditioning", // "full" is a typo away from "pull"
    ]);
  });

  it("matches notes last", () => {
    expect(names(searchRoutines(routines, "heavy"))).toEqual(["Upper Body"]);
  });

  it("matches query words split across fields", () => {
    const exercises = new Map([["Leg Day", ["Back Squat"]]]);
    expect(names(searchRoutines(routines, "leg squat", exercises))).toEqual(["Leg Day"]);
  });

  it("keeps the given order for equal scores", () => {
    const tied = [routine("B Day"), routine("A Day")];
    expect(names(searchRoutines(tied, "day"))).toEqual(["B Day", "A Day"]);
  });
});
