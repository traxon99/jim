import { describe, expect, it } from "vitest";
import { MAX_WORK_SECONDS, setTimerReadout, workSecondsBetween, workStats } from "../set-timer";

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

describe("setTimerReadout", () => {
  const start = Date.parse("2026-11-19T12:00:10Z");

  it("counts down to the set while getting into position (issue #846)", () => {
    expect(setTimerReadout(start, null, start - 10_000)).toEqual({
      phase: "ready",
      elapsed: 0,
      readyRemaining: 10,
    });
    expect(setTimerReadout(start, null, start - 2_500).readyRemaining).toBe(3);
  });

  it("runs from the start time", () => {
    expect(setTimerReadout(start, null, start)).toEqual({
      phase: "running",
      elapsed: 0,
      readyRemaining: 0,
    });
    expect(setTimerReadout(start, null, start + 14_900).elapsed).toBe(14);
  });

  it("holds the set's time once ended", () => {
    expect(setTimerReadout(start, start + 42_000, start + 99_000)).toEqual({
      phase: "ended",
      elapsed: 42,
      readyRemaining: 0,
    });
  });
});
