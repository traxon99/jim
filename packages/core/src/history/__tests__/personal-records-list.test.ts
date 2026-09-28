import { describe, expect, it } from "vitest";
import {
  type PersonalRecordEntry,
  currentPersonalRecords,
  personalRecordProgression,
  personalRecordStats,
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
