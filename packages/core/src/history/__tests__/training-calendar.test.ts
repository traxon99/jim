import { describe, expect, it } from "vitest";
import { buildTrainingCalendar, dateKey } from "../training-calendar";

describe("dateKey", () => {
  it("formats a date as YYYY-MM-DD in local time", () => {
    expect(dateKey(new Date(2026, 0, 4, 23, 59))).toBe("2026-01-04");
  });

  it("zero-pads single-digit months and days", () => {
    expect(dateKey(new Date(2026, 8, 1))).toBe("2026-09-01");
  });
});

describe("buildTrainingCalendar", () => {
  it("counts one session on its day", () => {
    const days = buildTrainingCalendar([
      { startedAt: new Date(2026, 0, 4, 9, 0), totalVolume: 1000 },
    ]);
    expect(days.get("2026-01-04")).toEqual({
      date: "2026-01-04",
      sessionCount: 1,
      totalVolume: 1000,
    });
  });

  it("accumulates two sessions on the same day", () => {
    const days = buildTrainingCalendar([
      { startedAt: new Date(2026, 0, 4, 9, 0), totalVolume: 1000 },
      { startedAt: new Date(2026, 0, 4, 18, 0), totalVolume: 500 },
    ]);
    expect(days.get("2026-01-04")).toEqual({
      date: "2026-01-04",
      sessionCount: 2,
      totalVolume: 1500,
    });
  });

  it("keeps different days separate", () => {
    const days = buildTrainingCalendar([
      { startedAt: new Date(2026, 0, 4), totalVolume: 1000 },
      { startedAt: new Date(2026, 0, 5), totalVolume: 500 },
    ]);
    expect(days.size).toBe(2);
  });

  it("returns an empty map for no sessions", () => {
    expect(buildTrainingCalendar([]).size).toBe(0);
  });
});
