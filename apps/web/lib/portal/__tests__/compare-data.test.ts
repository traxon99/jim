import type { AnalysisSet } from "@jim/core";
import { describe, expect, it } from "vitest";
import {
  MAX_COMPARE_LIFTS,
  compareLifts,
  compareSeries,
  compareWindow,
  formatDateParam,
  parseDateParam,
  parseLiftsParam,
} from "../compare-data";

function set(exerciseId: string, sessionId: string, day: number, weight: number, reps = 5) {
  return {
    exerciseId,
    sessionId,
    completedAt: new Date(2026, 2, day, 18),
    weight,
    reps,
  } satisfies AnalysisSet;
}

const sets: AnalysisSet[] = [
  set("bench", "s1", 2, 185),
  set("bench", "s1", 2, 195),
  set("bench", "s2", 9, 200),
  set("bench", "s3", 16, 205),
  set("squat", "s1", 2, 275),
  set("squat", "s3", 16, 285),
  set("plank", "s2", 9, 0),
];

describe("parseDateParam", () => {
  it("reads a real date as local midnight and round-trips it", () => {
    const date = parseDateParam("2026-03-09");
    expect(date).toEqual(new Date(2026, 2, 9));
    expect(date && formatDateParam(date)).toBe("2026-03-09");
  });

  it("ignores missing, malformed and impossible dates", () => {
    expect(parseDateParam(null)).toBeNull();
    expect(parseDateParam("March 9")).toBeNull();
    expect(parseDateParam("2026-02-31")).toBeNull();
  });
});

describe("compareWindow", () => {
  const now = new Date(2026, 5, 1, 12);

  it("follows the range picker with no custom dates", () => {
    const window = compareWindow("4w", null, null, now);
    expect(window.custom).toBe(false);
    expect(window.end).toBeNull();
    expect(window.start).toEqual(new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000));
  });

  it("includes the whole of the To day and swaps reversed dates", () => {
    expect(compareWindow("4w", "2026-03-16", "2026-03-02", now)).toEqual({
      start: new Date(2026, 2, 2),
      end: new Date(2026, 2, 17),
      custom: true,
    });
  });

  it("leaves a side open when only one date is set", () => {
    expect(compareWindow("12w", null, "2026-03-09", now)).toEqual({
      start: null,
      end: new Date(2026, 2, 10),
      custom: true,
    });
  });
});

describe("compareLifts", () => {
  it("keeps lifts with a weighted set, most-trained first, one point per session", () => {
    const lifts = compareLifts(sets);
    expect(lifts.map((lift) => lift.exerciseId)).toEqual(["bench", "squat"]);
    expect(lifts[0]?.points.map((point) => point.weight)).toEqual([195, 200, 205]);
  });
});

describe("parseLiftsParam", () => {
  const available = ["bench", "squat", "deadlift", "row", "press", "curl"];

  it("defaults to the two most-trained lifts", () => {
    expect(parseLiftsParam(null, available)).toEqual(["bench", "squat"]);
  });

  it("keeps known lifts in order, once each, up to the cap", () => {
    expect(parseLiftsParam("squat,gone,squat,bench", available)).toEqual(["squat", "bench"]);
    expect(parseLiftsParam(available.join(","), available)).toHaveLength(MAX_COMPARE_LIFTS);
  });

  it("reads an emptied list as no lifts", () => {
    expect(parseLiftsParam("none", available)).toEqual([]);
  });
});

describe("compareSeries", () => {
  const lifts = compareLifts(sets);

  it("keeps each lift's points inside the window, with its change across it", () => {
    const [bench, squat] = compareSeries(lifts, ["bench", "squat"], {
      start: new Date(2026, 2, 9),
      end: new Date(2026, 2, 17),
    });
    expect(bench?.points.map((point) => point.sessionId)).toEqual(["s2", "s3"]);
    expect(bench?.change).toBeGreaterThan(0);
    expect(bench?.best).toBe(bench?.points[1]?.estimatedOneRepMax);
    expect(squat?.points).toHaveLength(1);
    expect(squat?.change).toBeNull();
    expect(squat?.changePercent).toBeNull();
  });

  it("returns an empty series for a lift with nothing in the window", () => {
    const [bench] = compareSeries(lifts, ["bench"], { start: new Date(2027, 0, 1), end: null });
    expect(bench).toEqual({
      exerciseId: "bench",
      points: [],
      change: null,
      changePercent: null,
      best: null,
    });
  });
});
