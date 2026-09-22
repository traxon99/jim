import { describe, expect, it } from "vitest";
import { type SessionDisplayNameSet, deriveUntitledSessionName } from "../session-display-name";

function sets(
  ...primaryMuscles: SessionDisplayNameSet["primaryMuscles"][]
): SessionDisplayNameSet[] {
  return primaryMuscles.map((muscles) => ({ primaryMuscles: muscles }));
}

describe("deriveUntitledSessionName", () => {
  it("names the weekday and the muscle with the most sets", () => {
    const tuesday = new Date(2026, 0, 6, 9, 0); // a Tuesday
    const name = deriveUntitledSessionName(
      tuesday,
      sets(["chest"], ["chest"], ["chest"], ["triceps"]),
    );
    expect(name).toBe("Tuesday · Chest");
  });

  it("joins two muscles tied for the most sets, alphabetically", () => {
    const wednesday = new Date(2026, 0, 7, 9, 0); // a Wednesday
    const name = deriveUntitledSessionName(wednesday, sets(["shoulders"], ["chest"]));
    expect(name).toBe("Wednesday · Chest & Shoulders");
  });

  it("title-cases a two-word muscle name", () => {
    const saturday = new Date(2026, 0, 10, 9, 0); // a Saturday
    const name = deriveUntitledSessionName(saturday, sets(["lower back"]));
    expect(name).toBe("Saturday · Lower Back");
  });

  it("falls back to just the weekday when three or more muscles tie", () => {
    const thursday = new Date(2026, 0, 8, 9, 0); // a Thursday
    const name = deriveUntitledSessionName(thursday, sets(["chest"], ["shoulders"], ["triceps"]));
    expect(name).toBe("Thursday");
  });

  it("falls back to just the weekday when there are no sets", () => {
    const friday = new Date(2026, 0, 9, 9, 0); // a Friday
    expect(deriveUntitledSessionName(friday, [])).toBe("Friday");
  });

  it("counts a set toward every primary muscle it targets", () => {
    const monday = new Date(2026, 0, 5, 9, 0); // a Monday
    const name = deriveUntitledSessionName(
      monday,
      sets(["chest", "triceps"], ["chest", "triceps"], ["triceps"]),
    );
    expect(name).toBe("Monday · Triceps");
  });
});
