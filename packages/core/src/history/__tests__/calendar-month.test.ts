import { describe, expect, it } from "vitest";
import { buildCalendarMonth } from "../calendar-month";

describe("buildCalendarMonth", () => {
  it("pads a month that doesn't start on the week boundary with adjacent-month days", () => {
    // September 2026 starts on a Tuesday.
    const weeks = buildCalendarMonth(new Date(2026, 8, 1), 0);

    expect(weeks[0]?.[0]?.date).toEqual(new Date(2026, 7, 30));
    expect(weeks[0]?.[0]?.inMonth).toBe(false);
    expect(weeks[0]?.[2]?.date).toEqual(new Date(2026, 8, 1));
    expect(weeks[0]?.[2]?.inMonth).toBe(true);
  });

  it("pads the trailing week with the following month's days", () => {
    // September 2026 ends on a Wednesday.
    const weeks = buildCalendarMonth(new Date(2026, 8, 1), 0);
    const lastWeek = weeks[weeks.length - 1];

    expect(lastWeek?.[3]?.date).toEqual(new Date(2026, 8, 30));
    expect(lastWeek?.[3]?.inMonth).toBe(true);
    expect(lastWeek?.[4]?.date).toEqual(new Date(2026, 9, 1));
    expect(lastWeek?.[4]?.inMonth).toBe(false);
  });

  it("respects a non-Sunday week start", () => {
    // With weekStart=1 (Monday), September 2026's grid starts on Mon Aug 31.
    const weeks = buildCalendarMonth(new Date(2026, 8, 1), 1);

    expect(weeks[0]?.[0]?.date).toEqual(new Date(2026, 7, 31));
    expect(weeks[0]?.[0]?.inMonth).toBe(false);
  });

  it("produces only full 7-day weeks", () => {
    const weeks = buildCalendarMonth(new Date(2026, 8, 1), 0);
    for (const week of weeks) {
      expect(week).toHaveLength(7);
    }
  });

  it("covers a month that exactly fills its weeks without extra padding rows", () => {
    // February 2026 starts on a Sunday and ends on a Saturday.
    const weeks = buildCalendarMonth(new Date(2026, 1, 1), 0);

    expect(weeks).toHaveLength(4);
    expect(weeks[0]?.[0]?.date).toEqual(new Date(2026, 1, 1));
    expect(weeks[3]?.[6]?.date).toEqual(new Date(2026, 1, 28));
  });
});
