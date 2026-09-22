import { describe, expect, it } from "vitest";
import { groupByMonth, startOfMonth } from "../month-grouping";

describe("startOfMonth", () => {
  it("returns the first of the month, dropping the day and time-of-day", () => {
    const mid = new Date(2026, 0, 15, 23, 59, 59);
    expect(startOfMonth(mid).toDateString()).toBe(new Date(2026, 0, 1).toDateString());
  });
});

describe("groupByMonth", () => {
  interface Item {
    id: string;
    date: Date;
  }

  it("groups items into the same bucket when they fall in the same calendar month", () => {
    const items: Item[] = [
      { id: "a", date: new Date(2026, 0, 4) },
      { id: "b", date: new Date(2026, 0, 28) },
    ];
    const groups = groupByMonth(items, (item) => item.date);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("separates items into different months", () => {
    const items: Item[] = [
      { id: "a", date: new Date(2026, 0, 31) },
      { id: "b", date: new Date(2026, 1, 1) },
    ];
    const groups = groupByMonth(items, (item) => item.date);
    expect(groups).toHaveLength(2);
  });

  it("orders groups newest month first", () => {
    const items: Item[] = [
      { id: "old", date: new Date(2026, 0, 4) },
      { id: "new", date: new Date(2026, 1, 4) },
    ];
    const groups = groupByMonth(items, (item) => item.date);
    expect(groups.map((g) => g.items[0]?.id)).toEqual(["new", "old"]);
  });

  it("returns an empty array for no items", () => {
    expect(groupByMonth<Item>([], (item) => item.date)).toEqual([]);
  });
});
