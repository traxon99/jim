import { describe, expect, it } from "vitest";
import { estimateOneRepMax } from "../../one-rep-max";
import {
  type AnalysisSet,
  analysisRangeStart,
  strengthTrends,
  summarizeTraining,
  weeklyVolumeTotals,
} from "../strength-analysis";

// A Wednesday, so week boundaries fall mid-range.
const NOW = new Date(2026, 2, 4, 12);

function set(overrides: Partial<AnalysisSet> = {}): AnalysisSet {
  return {
    exerciseId: "bench",
    sessionId: "session-1",
    completedAt: new Date(2026, 2, 2, 18),
    weight: 200,
    reps: 5,
    ...overrides,
  };
}

describe("analysisRangeStart", () => {
  it("looks back the range's number of weeks, or returns null for all time", () => {
    expect(analysisRangeStart("4w", NOW)?.getTime()).toBe(
      NOW.getTime() - 4 * 7 * 24 * 60 * 60 * 1000,
    );
    expect(analysisRangeStart("all", NOW)).toBeNull();
  });
});

describe("summarizeTraining", () => {
  it("counts distinct workouts, sets and volume within the range", () => {
    const since = new Date(2026, 1, 1);
    const summary = summarizeTraining(
      [
        set({ sessionId: "a", weight: 100, reps: 10 }),
        set({ sessionId: "a", weight: 100, reps: 8 }),
        set({ sessionId: "b", weight: null, reps: 12 }),
        set({ sessionId: "old", completedAt: new Date(2026, 0, 1) }),
      ],
      since,
      NOW,
    );
    expect(summary.workouts).toBe(2);
    expect(summary.sets).toBe(3);
    expect(summary.volume).toBe(1800);
    const weeks = (NOW.getTime() - since.getTime()) / (7 * 24 * 60 * 60 * 1000);
    expect(summary.workoutsPerWeek).toBeCloseTo(2 / weeks);
  });

  it("doesn't report more than one workout per week for a single recent session", () => {
    const summary = summarizeTraining([set()], null, NOW);
    expect(summary.workoutsPerWeek).toBe(1);
  });

  it("is all zeros with no history", () => {
    expect(summarizeTraining([], null, NOW)).toEqual({
      workouts: 0,
      sets: 0,
      volume: 0,
      workoutsPerWeek: 0,
    });
  });
});

describe("strengthTrends", () => {
  it("reports start, current and change within the range, and the all-time best", () => {
    const [trend] = strengthTrends(
      [
        set({ sessionId: "old", completedAt: new Date(2025, 11, 1), weight: 250, reps: 1 }),
        set({ sessionId: "s1", completedAt: new Date(2026, 1, 2), weight: 200, reps: 5 }),
        set({ sessionId: "s2", completedAt: new Date(2026, 1, 16), weight: 210, reps: 5 }),
      ],
      new Date(2026, 0, 1),
    );

    const start = estimateOneRepMax(200, 5);
    const current = estimateOneRepMax(210, 5);
    expect(trend?.start).toBe(start);
    expect(trend?.current).toBe(current);
    expect(trend?.change).toBeCloseTo(current - start);
    expect(trend?.changePercent).toBeCloseTo(((current - start) / start) * 100);
    expect(trend?.allTimeBest).toBe(250);
    expect(trend?.sessions).toBe(2);
    expect(trend?.points.map((point) => point.sessionId)).toEqual(["s1", "s2"]);
  });

  it("leaves out exercises with no weighted set in range", () => {
    const trends = strengthTrends(
      [
        set({ exerciseId: "squat", completedAt: new Date(2025, 0, 1) }),
        set({ exerciseId: "plank", weight: null, reps: null }),
        set({ exerciseId: "bench" }),
      ],
      new Date(2026, 0, 1),
    );
    expect(trends.map((trend) => trend.exerciseId)).toEqual(["bench"]);
  });

  it("sorts the most-trained exercises first", () => {
    const trends = strengthTrends(
      [
        set({ exerciseId: "curl", sessionId: "a", weight: 40 }),
        set({ exerciseId: "squat", sessionId: "a", weight: 300 }),
        set({ exerciseId: "curl", sessionId: "b", weight: 45 }),
      ],
      null,
    );
    expect(trends.map((trend) => trend.exerciseId)).toEqual(["curl", "squat"]);
  });
});

describe("weeklyVolumeTotals", () => {
  it("fills weeks with no training with zeros, oldest first", () => {
    const weeks = weeklyVolumeTotals(
      [
        set({ sessionId: "a", completedAt: new Date(2026, 1, 16), weight: 100, reps: 10 }),
        set({ sessionId: "b", completedAt: new Date(2026, 2, 2), weight: 50, reps: 10 }),
      ],
      0,
      new Date(2026, 1, 15),
      NOW,
    );

    expect(weeks.map((week) => week.weekStart)).toEqual([
      new Date(2026, 1, 15),
      new Date(2026, 1, 22),
      new Date(2026, 2, 1),
    ]);
    expect(weeks.map((week) => week.volume)).toEqual([1000, 0, 500]);
    expect(weeks.map((week) => week.workouts)).toEqual([1, 0, 1]);
  });

  it("starts at the first set's week for all time, and is empty with no history", () => {
    const weeks = weeklyVolumeTotals([set({ completedAt: new Date(2026, 1, 25) })], 1, null, NOW);
    expect(weeks[0]?.weekStart).toEqual(new Date(2026, 1, 23));
    expect(weeks).toHaveLength(2);
    expect(weeklyVolumeTotals([], 0, null, NOW)).toEqual([]);
  });
});
