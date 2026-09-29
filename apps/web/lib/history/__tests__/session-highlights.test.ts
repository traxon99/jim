import { describe, expect, it } from "vitest";
import { buildSessionHighlights, formatHighlightSet } from "../session-highlights";

const exercises = [
  { id: "bench", name: "Bench Press" },
  { id: "pullup", name: "Pull-up" },
  { id: "curl", name: "Curl" },
];

function sessionExercise(id: string, sessionId: string, exerciseId: string, position: number) {
  return { id, sessionId, exerciseId, position, deletedAt: null };
}

function set(
  id: string,
  sessionExerciseId: string,
  weight: string | null,
  reps: number | null,
  extra: { kind?: "working" | "warmup"; supersedesId?: string; deletedAt?: Date } = {},
) {
  return {
    id,
    sessionExerciseId,
    kind: extra.kind ?? "working",
    weight,
    reps,
    supersedesId: extra.supersedesId ?? null,
    deletedAt: extra.deletedAt ?? null,
  } as const;
}

describe("buildSessionHighlights", () => {
  it("lists each exercise in workout order with its heaviest set, then most reps", () => {
    const highlights = buildSessionHighlights(
      [sessionExercise("se2", "s1", "pullup", 1), sessionExercise("se1", "s1", "bench", 0)],
      exercises,
      [
        set("a", "se1", "185.00", 5),
        set("b", "se1", "195.00", 3),
        set("c", "se1", "195.00", 4),
        set("d", "se2", null, 8),
        set("e", "se2", null, 10),
      ],
    );
    expect(highlights.get("s1")).toEqual([
      { exerciseName: "Bench Press", weight: 195, reps: 4 },
      { exerciseName: "Pull-up", weight: null, reps: 10 },
    ]);
  });

  it("ignores warm-up sets unless they're all there is", () => {
    const highlights = buildSessionHighlights(
      [sessionExercise("se1", "s1", "bench", 0), sessionExercise("se2", "s1", "curl", 1)],
      exercises,
      [
        set("a", "se1", "225.00", 1, { kind: "warmup" }),
        set("b", "se1", "185.00", 5),
        set("c", "se2", "20.00", 15, { kind: "warmup" }),
      ],
    );
    expect(highlights.get("s1")).toEqual([
      { exerciseName: "Bench Press", weight: 185, reps: 5 },
      { exerciseName: "Curl", weight: 20, reps: 15 },
    ]);
  });

  it("uses the current version of edited sets and skips deleted ones and empty exercises", () => {
    const highlights = buildSessionHighlights(
      [sessionExercise("se1", "s1", "bench", 0), sessionExercise("se3", "s1", "curl", 1)],
      exercises,
      [
        set("a", "se1", "300.00", 5),
        set("a2", "se1", "185.00", 5, { supersedesId: "a" }),
        set("b", "se1", "205.00", 5),
        set("b2", "se1", "205.00", 5, { supersedesId: "b", deletedAt: new Date() }),
      ],
    );
    expect(highlights.get("s1")).toEqual([{ exerciseName: "Bench Press", weight: 185, reps: 5 }]);
  });
});

describe("formatHighlightSet", () => {
  it("formats weighted, bodyweight and reps-less sets", () => {
    expect(formatHighlightSet({ exerciseName: "x", weight: 185, reps: 5 })).toBe("185 × 5");
    expect(formatHighlightSet({ exerciseName: "x", weight: null, reps: 12 })).toBe("× 12");
    expect(formatHighlightSet({ exerciseName: "x", weight: 60, reps: null })).toBe("60");
  });
});
