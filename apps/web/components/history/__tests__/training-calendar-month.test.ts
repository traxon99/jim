import { describe, expect, it } from "vitest";
import { dayAriaLabel } from "../training-calendar-month";

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
