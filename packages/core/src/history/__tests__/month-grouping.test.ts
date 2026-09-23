import { describe, expect, it } from "vitest";
import { startOfMonth } from "../month-grouping";

describe("startOfMonth", () => {
  it("returns the first of the month, dropping the day and time-of-day", () => {
    const mid = new Date(2026, 0, 15, 23, 59, 59);
    expect(startOfMonth(mid).toDateString()).toBe(new Date(2026, 0, 1).toDateString());
  });
});
