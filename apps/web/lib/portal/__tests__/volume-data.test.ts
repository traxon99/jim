import { describe, expect, it } from "vitest";
import {
  averagePerWeek,
  reviveVolumeSets,
  serializeVolumeSets,
  volumeWeeksInRange,
} from "../volume-data";

function set(day: string, primary: string[], secondary: string[] = []) {
  return {
    completedAt: new Date(`${day}T12:00:00`),
    weight: 100,
    reps: 5,
    primaryMuscles: primary,
    secondaryMuscles: secondary,
  };
}

// Mondays (weekStart 1): Sep 14, 21, 28 and Oct 5, 2026.
const now = new Date("2026-10-07T12:00:00");

describe("volumeWeeksInRange", () => {
  it("fills weeks with no sets, newest first", () => {
    const weeks = volumeWeeksInRange(
      [set("2026-09-15", ["chest"], ["triceps"]), set("2026-10-06", ["chest"])],
      1,
      "12w",
      now,
    );
    expect(weeks.map((week) => week.weekStart.getDate())).toEqual([5, 28, 21, 14]);
    expect(weeks[0]?.setsByMuscle).toEqual({ chest: 1 });
    expect(weeks[1]?.setsByMuscle).toEqual({});
    expect(weeks[3]?.setsByMuscle).toEqual({ chest: 1, triceps: 0.5 });
  });

  it("shows only the range's weeks, this one included", () => {
    const weeks = volumeWeeksInRange(
      [set("2026-01-05", ["lats"]), set("2026-10-06", ["chest"])],
      1,
      "4w",
      now,
    );
    expect(weeks).toHaveLength(4);
    expect(weeks[3]?.weekStart.getDate()).toBe(14);
  });

  it("is empty with no sets", () => {
    expect(volumeWeeksInRange([], 1, "all", now)).toEqual([]);
  });
});

describe("averagePerWeek", () => {
  it("averages across every week, empty ones included", () => {
    const weeks = volumeWeeksInRange(
      [set("2026-09-15", ["chest"]), set("2026-09-16", ["chest"]), set("2026-10-06", ["chest"])],
      1,
      "12w",
      now,
    );
    expect(averagePerWeek(weeks, (week) => week.setsByMuscle)).toEqual({ chest: 0.75 });
  });
});

describe("serializeVolumeSets", () => {
  it("round-trips", () => {
    const sets = [set("2026-10-06", ["chest"], ["triceps"])];
    expect(reviveVolumeSets(serializeVolumeSets(sets))).toEqual(sets);
  });
});
