import { describe, expect, it } from "vitest";
import { estimateOneRepMax } from "../../one-rep-max";
import {
  type PredictionSet,
  predictOneRepMax,
  predictedOneRepMaxSeries,
} from "../predicted-one-rep-max";

const DAY = 24 * 60 * 60 * 1000;
const START = new Date("2026-01-05T12:00:00.000Z").getTime();

function day(n: number): Date {
  return new Date(START + n * DAY);
}

function set(n: number, weight: number, reps: number, extra: Partial<PredictionSet> = {}) {
  return { sessionId: `s${n}`, completedAt: day(n), weight, reps, ...extra } as PredictionSet;
}

/** Twice a week for `weeks` weeks, each session's top set from `weightAt`. */
function program(weeks: number, weightAt: (session: number) => number, reps = 5, rpe = 8) {
  const sets: PredictionSet[] = [];
  for (let session = 0; session < weeks * 2; session++) {
    const n = Math.floor(session / 2) * 7 + (session % 2) * 3;
    sets.push(set(n, weightAt(session), reps, { rpe }));
  }
  return sets;
}

describe("predictOneRepMax", () => {
  it("returns null with nothing weighted to go on", () => {
    expect(predictOneRepMax([], day(0))).toBeNull();
    expect(predictOneRepMax([set(0, 0, 5), set(0, 100, 0)], day(0))).toBeNull();
  });

  it("matches the RPE-adjusted estimate for a single session", () => {
    const prediction = predictOneRepMax([set(0, 200, 5, { rpe: 8 })], day(0));
    // 5 reps at RPE 8 = 7 reps to failure.
    expect(prediction?.value).toBe(estimateOneRepMax(200, 7));
    expect(prediction?.trendPerWeek).toBe(0);
    expect(prediction?.confidence).toBe("low");
  });

  it("leaves out warm-up sets", () => {
    const prediction = predictOneRepMax(
      [set(0, 300, 5, { kind: "warmup" }), set(0, 200, 5, { kind: "working" })],
      day(0),
    );
    expect(prediction?.value).toBe(estimateOneRepMax(200, 5));
  });

  it("caps reps to failure at MAX_ESTIMATE_REPS", () => {
    const prediction = predictOneRepMax([set(0, 50, 14, { rpe: 6 })], day(0));
    expect(prediction?.value).toBe(estimateOneRepMax(50, 15));
  });

  it("ignores RPE outside the app's bounds", () => {
    const prediction = predictOneRepMax([set(0, 200, 5, { rpe: 2 })], day(0));
    expect(prediction?.value).toBe(estimateOneRepMax(200, 5));
  });

  it("follows a steady climb rather than lagging behind it", () => {
    const sets = program(10, (session) => 200 + session * 2.5);
    const last = sets[sets.length - 1] as PredictionSet;
    const prediction = predictOneRepMax(sets, last.completedAt);
    const lastDaily = estimateOneRepMax(last.weight as number, 7);
    expect(prediction?.trendPerWeek).toBeGreaterThan(0);
    expect(prediction?.value).toBeGreaterThanOrEqual(lastDaily);
    expect(prediction?.value).toBeLessThan(lastDaily * 1.03);
    expect(prediction?.confidence).toBe("high");
  });

  it("holds a recent PR up through a lighter day", () => {
    const sets = [
      ...program(4, () => 200),
      set(30, 240, 3, { rpe: 9 }),
      set(33, 180, 8, { rpe: 6 }),
    ];
    const prediction = predictOneRepMax(sets, day(33));
    expect(prediction?.value).toBe(estimateOneRepMax(240, 4));
  });

  it("smooths over a single easy day instead of dropping with it", () => {
    const sets = [...program(6, () => 225), set(42, 135, 5)];
    const prediction = predictOneRepMax(sets, day(42));
    expect(prediction?.value).toBeGreaterThan(estimateOneRepMax(225, 7) * 0.97);
  });

  it("fades the prediction after a long layoff, never below the floor", () => {
    const sets = program(6, () => 225);
    const lastDay = 38;
    const fresh = predictOneRepMax(sets, day(lastDay + 7))?.value ?? 0;
    const eightWeeksOff = predictOneRepMax(sets, day(lastDay + 56))?.value ?? 0;
    const yearOff = predictOneRepMax(sets, day(lastDay + 365));
    expect(eightWeeksOff).toBeLessThan(fresh);
    expect(eightWeeksOff).toBeCloseTo(fresh * 0.95, 0);
    expect(yearOff?.value).toBeCloseTo(fresh * 0.85, 0);
    expect(yearOff?.confidence).toBe("low");
  });

  it("caps the weekly trend so two sessions can't promise a huge jump", () => {
    const prediction = predictOneRepMax([set(0, 100, 5), set(7, 200, 5)], day(21));
    const level = estimateOneRepMax(200, 5);
    expect(prediction?.trendPerWeek).toBeLessThanOrEqual(level * 0.015);
  });

  it("only reads sets at or before the prediction date", () => {
    const sets = [set(0, 200, 5), set(10, 300, 5)];
    expect(predictOneRepMax(sets, day(5))?.value).toBe(estimateOneRepMax(200, 5));
  });
});

describe("predictedOneRepMaxSeries", () => {
  it("has one point per session, oldest first, each predicted from what came before", () => {
    const sets = [set(7, 210, 5), set(0, 200, 5), set(0, 100, 10)];
    const points = predictedOneRepMaxSeries(sets);
    expect(points.map((point) => point.sessionId)).toEqual(["s0", "s7"]);
    expect(points[0]?.predictedOneRepMax).toBe(estimateOneRepMax(200, 5));
    expect(points[1]?.predictedOneRepMax).toBe(predictOneRepMax(sets, day(7))?.value as number);
  });
});
