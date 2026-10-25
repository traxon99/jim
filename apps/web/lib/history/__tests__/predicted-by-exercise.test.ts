import { estimateOneRepMax } from "@jim/core";
import { describe, expect, it } from "vitest";
import { predictedOneRepMaxByExercise } from "../predicted-by-exercise";

const DAY = new Date("2026-03-02T18:00:00.000Z");

function set(id: string, sessionExerciseId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    sessionExerciseId,
    supersedesId: null,
    deletedAt: null,
    completedAt: DAY,
    kind: "working",
    weight: "200.00",
    reps: 5,
    rpe: null,
    ...extra,
  };
}

describe("predictedOneRepMaxByExercise", () => {
  const sessions = [
    { id: "s1", deletedAt: null },
    { id: "gone", deletedAt: DAY },
  ];
  const sessionExercises = [
    { id: "se1", sessionId: "s1", exerciseId: "bench", deletedAt: null },
    { id: "se2", sessionId: "gone", exerciseId: "bench", deletedAt: null },
    { id: "se3", sessionId: "s1", exerciseId: "squat", deletedAt: DAY },
  ];

  it("predicts from live, current sets only, reading synced numeric strings", () => {
    const result = predictedOneRepMaxByExercise(
      sessions,
      sessionExercises,
      [
        set("a", "se1"),
        set("b", "se1", { supersedesId: "a", weight: "210.00", rpe: "8.0" }),
        set("c", "se1", { weight: "300.00", deletedAt: DAY }),
        set("d", "se1", { weight: "400.00", kind: "warmup" }),
        set("e", "se2", { weight: "500.00" }),
        set("f", "se3", { weight: "500.00" }),
      ],
      DAY,
    );
    expect([...result.keys()]).toEqual(["bench"]);
    expect(result.get("bench")?.value).toBe(estimateOneRepMax(210, 7));
  });
});
