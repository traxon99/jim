import { describe, expect, it } from "vitest";
import { groupByWeek, startOfWeek } from "../week-grouping";

describe("startOfWeek", () => {
  it("returns the same day when it is already the configured week start (Sunday = 0)", () => {
    const sunday = new Date("2026-01-04T15:00:00.000Z"); // a Sunday
    expect(startOfWeek(sunday, 0).toDateString()).toBe(new Date(2026, 0, 4).toDateString());
  });

  it("walks back to the most recent occurrence of the configured week start", () => {
    const wednesday = new Date(2026, 0, 7); // Wed Jan 7 2026
    expect(startOfWeek(wednesday, 0).toDateString()).toBe(new Date(2026, 0, 4).toDateString());
  });

  it("supports a Monday week start", () => {
    const wednesday = new Date(2026, 0, 7); // Wed Jan 7 2026
    expect(startOfWeek(wednesday, 1).toDateString()).toBe(new Date(2026, 0, 5).toDateString());
  });

  it("drops time-of-day", () => {
    const late = new Date(2026, 0, 7, 23, 59, 59);
    const early = new Date(2026, 0, 7, 0, 0, 1);
    expect(startOfWeek(late, 0).getTime()).toBe(startOfWeek(early, 0).getTime());
  });
});

describe("groupByWeek", () => {
  interface Item {
    id: string;
    date: Date;
  }

  it("groups items into the same bucket when they fall in the same week", () => {
    const items: Item[] = [
      { id: "a", date: new Date(2026, 0, 4) },
      { id: "b", date: new Date(2026, 0, 7) },
    ];
    const groups = groupByWeek(items, 0, (item) => item.date);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("separates items into different weeks", () => {
    const items: Item[] = [
      { id: "a", date: new Date(2026, 0, 4) },
      { id: "b", date: new Date(2026, 0, 11) },
    ];
    const groups = groupByWeek(items, 0, (item) => item.date);
    expect(groups).toHaveLength(2);
  });

  it("orders groups newest week first", () => {
    const items: Item[] = [
      { id: "old", date: new Date(2026, 0, 4) },
      { id: "new", date: new Date(2026, 0, 11) },
    ];
    const groups = groupByWeek(items, 0, (item) => item.date);
    expect(groups.map((g) => g.items[0]?.id)).toEqual(["new", "old"]);
  });

  it("returns an empty array for no items", () => {
    expect(groupByWeek<Item>([], 0, (item) => item.date)).toEqual([]);
  });
});
