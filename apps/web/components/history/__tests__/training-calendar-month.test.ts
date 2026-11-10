import { describe, expect, it } from "vitest";
import { SICK_DAY_CLASS, dayAriaLabel, dayFillClass } from "../training-calendar-month";

const date = new Date(2026, 2, 4);

describe("dayAriaLabel", () => {
  it("names just the date for an untrained, unselected day", () => {
    expect(dayAriaLabel(date, 0, false)).toMatch(/Mar/);
    expect(dayAriaLabel(date, 0, false)).not.toMatch(/workout|selected/);
  });

  it("adds the workout count, pluralised", () => {
    expect(dayAriaLabel(date, 1, false)).toMatch(/, 1 workout$/);
    expect(dayAriaLabel(date, 2, false)).toMatch(/, 2 workouts$/);
  });

  it("says selected last", () => {
    expect(dayAriaLabel(date, 2, true)).toMatch(/, 2 workouts, selected$/);
    expect(dayAriaLabel(date, 0, true)).toMatch(/, selected$/);
  });
});

describe("dayFillClass", () => {
  it("keeps the sick outline on a trained day (issue #781)", () => {
    expect(dayFillClass("bg-accent", true)).toBe(`bg-accent ${SICK_DAY_CLASS}`);
  });

  it("shows the outline alone on an untrained sick day, and nothing extra otherwise", () => {
    expect(dayFillClass("", true)).toBe(SICK_DAY_CLASS);
    expect(dayFillClass("bg-accent", false)).toBe("bg-accent");
  });

  it("names both the workout and the sick day for a screen reader", () => {
    expect(dayAriaLabel(date, 1, false, true)).toMatch(/, 1 workout, sick day$/);
  });
});
