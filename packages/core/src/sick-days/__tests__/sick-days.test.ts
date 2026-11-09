import { describe, expect, it } from "vitest";
import { dayKeyNoon, dayKeysBetween, sickDayKeys } from "..";

describe("sickDayKeys", () => {
  it("keeps live, valid days once each, oldest first", () => {
    const rows = [
      { day: "2026-11-09", deletedAt: null },
      { day: "2026-11-02", deletedAt: null },
      { day: "2026-11-09", deletedAt: null },
      { day: "2026-11-05", deletedAt: new Date() },
      { day: "nope", deletedAt: null },
    ];
    expect(sickDayKeys(rows)).toEqual(["2026-11-02", "2026-11-09"]);
  });
});

describe("dayKeysBetween", () => {
  it("lists every day across a month end, both ends included", () => {
    expect(dayKeysBetween("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });

  it("is empty for a reversed or invalid range", () => {
    expect(dayKeysBetween("2026-11-02", "2026-11-01")).toEqual([]);
    expect(dayKeysBetween("2026-02-30", "2026-03-01")).toEqual([]);
  });
});

describe("dayKeyNoon", () => {
  it("is local noon on that day", () => {
    const date = dayKeyNoon("2026-03-08");
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
      2026, 2, 8, 12,
    ]);
  });
});
