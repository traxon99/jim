import { describe, expect, it } from "vitest";
import { formatCompact, formatMinutes, periodStats, weekActivity } from "../stats";

function session(start: string, minutes: number, totalVolume = 1000, prCount = 0) {
  const startedAt = new Date(start);
  return {
    startedAt,
    endedAt: new Date(startedAt.getTime() + minutes * 60_000),
    totalVolume,
    prCount,
  };
}

describe("periodStats", () => {
  // A Thursday afternoon.
  const now = new Date(2026, 8, 24, 15, 0);

  it("totals the last seven days, today included, against the seven before", () => {
    const sessions = [
      session("2026-09-24T09:00", 45, 5000, 2),
      session("2026-09-24T18:00", 15, 1000),
      session("2026-09-18T09:00", 60, 3000, 1),
      // Previous week.
      session("2026-09-17T09:00", 30, 2000),
      // Outside both windows.
      session("2026-09-01T09:00", 30, 2000),
    ];
    const { current, previous } = periodStats(sessions, 7, now);
    expect(current).toEqual({ activeDays: 2, workouts: 3, minutes: 120, volume: 9000, prs: 3 });
    expect(previous).toEqual({ activeDays: 1, workouts: 1, minutes: 30, volume: 2000, prs: 0 });
  });

  it("widens with the range", () => {
    const sessions = [session("2026-09-01T09:00", 30), session("2026-07-01T09:00", 30)];
    expect(periodStats(sessions, 30, now).current.workouts).toBe(1);
    expect(periodStats(sessions, 90, now).current.workouts).toBe(2);
  });
});

describe("weekActivity", () => {
  it("marks trained, today and future days in a Monday-first week", () => {
    const now = new Date(2026, 8, 24, 15, 0);
    const days = weekActivity([new Date(2026, 8, 22, 9), new Date(2026, 8, 24, 9)], 1, now);
    expect(days.map((day) => day.date.getDay())).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(days.map((day) => day.trained)).toEqual([false, true, false, true, false, false, false]);
    expect(days.findIndex((day) => day.isToday)).toBe(3);
    expect(days.filter((day) => day.isFuture)).toHaveLength(3);
  });
});

describe("formatting", () => {
  it("shows minutes and hours", () => {
    expect(formatMinutes(16)).toBe("16m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(125)).toBe("2h 5m");
  });

  it("compacts large volumes", () => {
    expect(formatCompact(9450)).toBe("9,450");
    expect(formatCompact(12_340)).toBe("12.3k");
    expect(formatCompact(2_000_000)).toBe("2M");
  });
});
