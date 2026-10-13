import { describe, expect, it } from "vitest";
import { addWeeks, groupByWeek, isValidTimeZone, startOfWeek } from "../week-grouping";

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

describe("weeks in the user's time zone (issue #511)", () => {
  const LA = "America/Los_Angeles";

  it("puts a Sunday-evening set in Los Angeles in that Sunday's week, wherever it runs", () => {
    // Sun 2026-10-11 18:00 PDT is Mon 01:00 UTC.
    const set = new Date("2026-10-12T01:00:00Z");
    // Monday week start: the week of Mon Oct 5, which began at 07:00 UTC.
    expect(startOfWeek(set, 1, LA).toISOString()).toBe("2026-10-05T07:00:00.000Z");
    expect(startOfWeek(set, 1, "UTC").toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("starts a week at local midnight across a DST change", () => {
    // DST ends Sun 2026-11-01 in LA; Sunday weeks before and after it.
    expect(startOfWeek(new Date("2026-11-04T20:00:00Z"), 0, LA).toISOString()).toBe(
      "2026-11-01T07:00:00.000Z",
    );
    expect(startOfWeek(new Date("2026-10-28T20:00:00Z"), 0, LA).toISOString()).toBe(
      "2026-10-25T07:00:00.000Z",
    );
    expect(addWeeks(new Date("2026-10-25T07:00:00Z"), 1, 0, LA).toISOString()).toBe(
      "2026-11-01T07:00:00.000Z",
    );
    expect(addWeeks(new Date("2026-11-01T07:00:00Z"), 1, 0, LA).toISOString()).toBe(
      "2026-11-08T08:00:00.000Z",
    );
  });

  it("groups by the zone's weeks", () => {
    const groups = groupByWeek(
      [new Date("2026-10-12T01:00:00Z"), new Date("2026-10-12T16:00:00Z")],
      1,
      (date) => date,
      LA,
    );
    expect(groups.map((group) => group.items.length)).toEqual([1, 1]);
  });

  it("knows which zone names are real", () => {
    expect(isValidTimeZone(LA)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
