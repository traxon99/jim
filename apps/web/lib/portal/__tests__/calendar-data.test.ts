import { describe, expect, it } from "vitest";
import {
  calendarPeriodBounds,
  calendarPeriods,
  heatmapColumns,
  reviveAchievements,
  serializeAchievements,
} from "../calendar-data";

const today = new Date(2026, 9, 12, 15, 30); // Mon Oct 12 2026, local

describe("calendarPeriodBounds", () => {
  it("runs the last 12 months up to today", () => {
    const { start, end } = calendarPeriodBounds("12m", today);
    expect(start).toEqual(new Date(2025, 9, 13));
    expect(end).toEqual(new Date(2026, 9, 12));
  });

  it("cuts the current year off at today and keeps past years whole", () => {
    expect(calendarPeriodBounds("2026", today).end).toEqual(new Date(2026, 9, 12));
    expect(calendarPeriodBounds("2025", today)).toEqual({
      start: new Date(2025, 0, 1),
      end: new Date(2025, 11, 31),
    });
  });
});

describe("calendarPeriods", () => {
  it("lists the rolling year, then each year with a workout", () => {
    expect(calendarPeriods([new Date(2024, 4, 1), new Date(2026, 1, 1)], today)).toEqual([
      "12m",
      "2026",
      "2024",
    ]);
  });
});

describe("heatmapColumns", () => {
  it("makes week columns from the week start, blanking days outside the period", () => {
    // Thu Oct 1 to Mon Oct 12, 2026, Monday-first weeks.
    const columns = heatmapColumns(new Date(2026, 9, 1), new Date(2026, 9, 12), 1);
    expect(columns.map((column) => column.weekStart.getDate())).toEqual([28, 5, 12]);
    expect(columns[0]?.days.map((day) => (day.inPeriod ? day.date.getDate() : null))).toEqual([
      null,
      null,
      null,
      1,
      2,
      3,
      4,
    ]);
    expect(columns[2]?.days.filter((day) => day.inPeriod)).toHaveLength(1);
    expect(columns[0]?.monthLabel).not.toBeNull();
    expect(columns[1]?.monthLabel).toBeNull();
  });

  it("labels the column a month starts in", () => {
    const columns = heatmapColumns(new Date(2026, 8, 20), new Date(2026, 9, 12), 0);
    const labelled = columns.filter((column) => column.monthLabel).map((c) => c.weekStart);
    expect(labelled).toHaveLength(2);
    expect(labelled[1]).toEqual(new Date(2026, 8, 27));
  });
});

describe("serializeAchievements", () => {
  it("round-trips earned and unearned badges", () => {
    const achievements = [
      {
        id: "workouts-1",
        category: "workouts" as const,
        title: "First workout",
        description: "Finish your first workout",
        achievedAt: new Date("2026-01-02T10:00:00Z"),
        sessionId: "s1",
        progress: null,
      },
      {
        id: "workouts-10",
        category: "workouts" as const,
        title: "10 workouts",
        description: "Finish 10 workouts",
        achievedAt: null,
        sessionId: null,
        progress: { current: 3, target: 10 },
      },
    ];
    expect(reviveAchievements(serializeAchievements(achievements))).toEqual(achievements);
  });
});
