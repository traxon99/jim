import { describe, expect, it } from "vitest";
import { MAX_WORK_SECONDS, workSecondsBetween, workStats } from "../set-timer";

describe("workSecondsBetween", () => {
  const start = new Date("2026-01-01T10:00:00Z");

  it("rounds to whole seconds", () => {
    expect(workSecondsBetween(start, new Date("2026-01-01T10:00:42.600Z"))).toBe(43);
  });

  it("drops a negative or left-running time", () => {
    expect(workSecondsBetween(start, new Date("2026-01-01T09:59:00Z"))).toBeNull();
    expect(
      workSecondsBetween(start, new Date(start.getTime() + (MAX_WORK_SECONDS + 1) * 1000)),
    ).toBeNull();
    expect(workSecondsBetween(start, new Date(start.getTime() + MAX_WORK_SECONDS * 1000))).toBe(
      MAX_WORK_SECONDS,
    );
  });
});

describe("workStats", () => {
  it("averages and totals only the timed sets", () => {
    expect(
      workStats([{ workSeconds: 30 }, { workSeconds: null }, {}, { workSeconds: 45 }]),
    ).toEqual({ timedCount: 2, averageWorkSeconds: 38, totalWorkSeconds: 75 });
  });

  it("has no average with nothing timed", () => {
    expect(workStats([{ workSeconds: null }])).toEqual({
      timedCount: 0,
      averageWorkSeconds: null,
      totalWorkSeconds: 0,
    });
  });
});
