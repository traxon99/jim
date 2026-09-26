import { describe, expect, it } from "vitest";
import { blockWeeksForProgram, formatProgramWeek, programWeekProgress } from "../duration";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

describe("programWeekProgress", () => {
  it.each([
    [0, "Week 1 of 8"],
    [6, "Week 1 of 8"],
    [7, "Week 2 of 8"],
    [49, "Week 8 of 8"],
    [55, "Week 8 of 8"],
    [56, "All 8 weeks done"],
    [200, "All 8 weeks done"],
  ])("day %s → %s", (n, text) => {
    const progress = programWeekProgress({ durationWeeks: 8, activatedAt: day(0) }, day(n));
    expect(progress && formatProgramWeek(progress)).toBe(text);
  });

  it("is null without a duration or activation time", () => {
    expect(programWeekProgress({ durationWeeks: null, activatedAt: day(0) }, day(3))).toBeNull();
    expect(programWeekProgress({ durationWeeks: 8, activatedAt: null }, day(3))).toBeNull();
  });

  it("treats a clock before activation as week 1", () => {
    expect(programWeekProgress({ durationWeeks: 4, activatedAt: day(5) }, day(0))).toEqual({
      week: 1,
      total: 4,
      finished: false,
    });
  });
});

describe("blockWeeksForProgram", () => {
  it.each([
    [null, null],
    [4, 6],
    [6, 6],
    [7, 6],
    [8, 8],
    [10, 8],
    [11, 12],
    [12, 12],
    [16, 12],
  ] as const)("%s weeks → %s", (duration, block) => {
    expect(blockWeeksForProgram(duration)).toBe(block);
  });
});
