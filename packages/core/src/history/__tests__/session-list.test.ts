import { describe, expect, it } from "vitest";
import { type SessionListEntry, groupSessionsByWeek } from "../session-list";

function entry(overrides: Partial<SessionListEntry> = {}): SessionListEntry {
  return {
    id: "s1",
    name: "Push Day",
    startedAt: new Date(2026, 0, 4, 9, 0),
    endedAt: new Date(2026, 0, 4, 10, 0),
    totalVolume: 1000,
    setCount: 10,
    prCount: 0,
    ...overrides,
  };
}

describe("groupSessionsByWeek", () => {
  it("groups sessions in the same week together", () => {
    const groups = groupSessionsByWeek(
      [
        entry({ id: "a", startedAt: new Date(2026, 0, 4, 9, 0) }),
        entry({ id: "b", startedAt: new Date(2026, 0, 6, 9, 0) }),
      ],
      0,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("orders sessions within a week most recent first", () => {
    const groups = groupSessionsByWeek(
      [
        entry({ id: "earlier", startedAt: new Date(2026, 0, 4, 9, 0) }),
        entry({ id: "later", startedAt: new Date(2026, 0, 5, 9, 0) }),
      ],
      0,
    );
    expect(groups[0]?.items.map((s) => s.id)).toEqual(["later", "earlier"]);
  });

  it("returns an empty array for no sessions", () => {
    expect(groupSessionsByWeek([], 0)).toEqual([]);
  });
});
