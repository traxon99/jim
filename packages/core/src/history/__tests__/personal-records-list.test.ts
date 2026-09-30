import { describe, expect, it } from "vitest";
import {
  type PersonalRecordEntry,
  currentPersonalRecords,
  personalRecordProgression,
  personalRecordStats,
  recentPersonalRecords,
  sortPersonalRecordGroups,
} from "../personal-records-list";

function record(overrides: Partial<PersonalRecordEntry> = {}): PersonalRecordEntry {
  return {
    id: "r1",
    exerciseId: "bench",
    kind: "1rm",
    value: 200,
    achievedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("currentPersonalRecords", () => {
  it("returns the highest-value record per exercise and kind", () => {
    const current = currentPersonalRecords([
      record({ id: "old", value: 200, achievedAt: new Date("2026-01-01T00:00:00.000Z") }),
      record({ id: "new", value: 220, achievedAt: new Date("2026-02-01T00:00:00.000Z") }),
    ]);
    expect(current).toHaveLength(1);
    expect(current[0]?.id).toBe("new");
  });

  it("breaks a value tie on the later achievedAt", () => {
    const current = currentPersonalRecords([
      record({
        id: "earlier",
        value: 10,
        kind: "reps_at_weight",
        achievedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      record({
        id: "later",
        value: 10,
        kind: "reps_at_weight",
        achievedAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
    ]);
    expect(current[0]?.id).toBe("later");
  });

  it("keeps different exercises and kinds separate", () => {
    const current = currentPersonalRecords([
      record({ id: "bench-1rm", exerciseId: "bench", kind: "1rm", value: 200 }),
      record({ id: "bench-volume", exerciseId: "bench", kind: "volume", value: 1000 }),
      record({ id: "squat-1rm", exerciseId: "squat", kind: "1rm", value: 300 }),
    ]);
    expect(current).toHaveLength(3);
  });

  it("returns an empty array for no records", () => {
    expect(currentPersonalRecords([])).toEqual([]);
  });
});

describe("personalRecordStats", () => {
  it("counts current PRs, this month's and the last week's rows", () => {
    const now = new Date(2026, 8, 28, 12);
    const stats = personalRecordStats(
      [
        record({ id: "a", value: 100, achievedAt: new Date(2026, 7, 20) }),
        record({ id: "b", value: 110, achievedAt: new Date(2026, 8, 3) }),
        record({ id: "c", value: 120, achievedAt: new Date(2026, 8, 25) }),
        record({ id: "d", exerciseId: "squat", kind: "weight", achievedAt: new Date(2026, 8, 27) }),
      ],
      now,
    );
    expect(stats).toEqual({ current: 2, thisMonth: 3, recent: 2, exercises: 2 });
  });
});

describe("personalRecordProgression", () => {
  it("returns each new best, oldest first", () => {
    const points = personalRecordProgression(
      [
        record({ value: 120, achievedAt: new Date(2026, 2, 1) }),
        record({ value: 100, achievedAt: new Date(2026, 0, 1) }),
        record({ value: 110, achievedAt: new Date(2026, 3, 1) }),
        record({ value: 999, kind: "weight" }),
      ],
      "bench",
      "1rm",
    );
    expect(points.map((point) => point.value)).toEqual([100, 120]);
  });
});

describe("recentPersonalRecords", () => {
  const now = new Date("2026-03-31T00:00:00.000Z");

  it("keeps current PRs from the window, newest first", () => {
    const recent = recentPersonalRecords(
      [
        record({
          id: "old",
          exerciseId: "squat",
          achievedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        record({ id: "a", exerciseId: "bench", achievedAt: new Date("2026-03-10T00:00:00.000Z") }),
        record({ id: "b", exerciseId: "row", achievedAt: new Date("2026-03-20T00:00:00.000Z") }),
      ],
      now,
    );
    expect(recent.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("drops a recent row that has since been beaten", () => {
    const recent = recentPersonalRecords(
      [
        record({ id: "first", value: 200, achievedAt: new Date("2026-03-10T00:00:00.000Z") }),
        record({ id: "second", value: 210, achievedAt: new Date("2026-03-12T00:00:00.000Z") }),
      ],
      now,
    );
    expect(recent.map((r) => r.id)).toEqual(["second"]);
  });

  it("honours a custom window", () => {
    const recent = recentPersonalRecords(
      [record({ achievedAt: new Date("2026-03-20T00:00:00.000Z") })],
      now,
      7,
    );
    expect(recent).toEqual([]);
  });
});

describe("sortPersonalRecordGroups", () => {
  const groups = [
    { name: "Squat", latestAt: new Date("2026-01-01"), headline: 300 },
    { name: "Pull-Up", latestAt: new Date("2026-03-01"), headline: null },
    { name: "Bench Press", latestAt: new Date("2026-02-01"), headline: 225 },
    { name: "Dips", latestAt: new Date("2026-02-01"), headline: null },
  ];

  it("sorts alphabetically", () => {
    expect(sortPersonalRecordGroups(groups, "name").map((g) => g.name)).toEqual([
      "Bench Press",
      "Dips",
      "Pull-Up",
      "Squat",
    ]);
  });

  it("sorts by most recent PR, ties by name", () => {
    expect(sortPersonalRecordGroups(groups, "recent").map((g) => g.name)).toEqual([
      "Pull-Up",
      "Bench Press",
      "Dips",
      "Squat",
    ]);
  });

  it("sorts heaviest first with rep-only lifts last", () => {
    expect(sortPersonalRecordGroups(groups, "heaviest").map((g) => g.name)).toEqual([
      "Squat",
      "Bench Press",
      "Dips",
      "Pull-Up",
    ]);
  });

  it("does not mutate its input", () => {
    const copy = [...groups];
    sortPersonalRecordGroups(groups, "heaviest");
    expect(groups).toEqual(copy);
  });
});
