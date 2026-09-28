import { describe, expect, it } from "vitest";
import { formatRestSeconds, isShortRest, restStats, restTakenSeconds } from "../rest-compliance";

describe("restTakenSeconds", () => {
  it("rounds to whole seconds and never goes negative", () => {
    const at = new Date("2026-01-01T10:00:00Z");
    expect(restTakenSeconds(at, new Date("2026-01-01T10:01:30.400Z"))).toBe(90);
    expect(restTakenSeconds(at, new Date("2026-01-01T09:59:00Z"))).toBe(0);
  });
});

describe("isShortRest", () => {
  it.each([
    [60, 90, true],
    [71, 90, true],
    [72, 90, false],
    [120, 90, false],
    [null, 90, false],
    [30, null, false],
    [0, 0, false],
  ] as const)("%s of %s → %s", (rest, target, short) => {
    expect(isShortRest(rest, target)).toBe(short);
  });
});

describe("restStats", () => {
  it("averages rests with a target and counts short ones", () => {
    expect(
      restStats([
        { restSeconds: null, restTargetSeconds: null },
        { restSeconds: 60, restTargetSeconds: 120 },
        { restSeconds: 130, restTargetSeconds: 120 },
        { restSeconds: 90, restTargetSeconds: null },
      ]),
    ).toEqual({
      restCount: 2,
      shortCount: 1,
      averageRestSeconds: 95,
      averageTargetSeconds: 120,
    });
  });

  it("is empty with no recorded rests", () => {
    expect(restStats([])).toEqual({
      restCount: 0,
      shortCount: 0,
      averageRestSeconds: null,
      averageTargetSeconds: null,
    });
  });
});

describe("formatRestSeconds", () => {
  it.each([
    [45, "45s"],
    [60, "1:00"],
    [95, "1:35"],
  ] as const)("%s → %s", (seconds, text) => {
    expect(formatRestSeconds(seconds)).toBe(text);
  });
});
