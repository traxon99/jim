import { describe, expect, it } from "vitest";
import { predictOneRepMax } from "../../history/predicted-one-rep-max";
import type { DprHistoryEntry } from "../decide";
import { predictedE1rm } from "../snapshot";

const RANGE = { low: 5, high: 8 };

function entry(exerciseId: string, day: number, weight: number, rpe: number | null) {
  return {
    exerciseId,
    repRange: RANGE,
    date: new Date(Date.UTC(2026, 2, day, 18)),
    sets: [
      { kind: "warmup", weight: weight * 2, reps: 5, rpe: null },
      { kind: "working", weight, reps: 5, rpe },
    ],
  } as DprHistoryEntry;
}

describe("predictedE1rm", () => {
  it("predicts one exercise from its PRP history, warm-ups left out", () => {
    const history = [
      entry("bench", 2, 200, 8),
      entry("squat", 3, 300, 8),
      entry("bench", 9, 205, 9),
    ];
    const now = new Date(Date.UTC(2026, 2, 10));
    const prediction = predictedE1rm(history, "bench", now);
    expect(prediction).toEqual(
      predictOneRepMax(
        [
          { sessionId: "a", completedAt: history[0]?.date as Date, weight: 200, reps: 5, rpe: 8 },
          { sessionId: "b", completedAt: history[2]?.date as Date, weight: 205, reps: 5, rpe: 9 },
        ],
        now,
      ),
    );
    expect(predictedE1rm(history, "row", now)).toBeNull();
  });
});
