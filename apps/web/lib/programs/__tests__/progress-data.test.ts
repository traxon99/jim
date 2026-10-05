import type { ExerciseRow, SessionExerciseRow, SessionRow, SetRow } from "@/lib/db/schema";
import { describe, expect, it } from "vitest";
import { buildProgramProgressSets } from "../progress-data";

const sessions = [
  { id: "s1", deletedAt: null },
  { id: "gone", deletedAt: new Date() },
] as SessionRow[];

const sessionExercises = [
  { id: "se-bench", sessionId: "s1", exerciseId: "bench", deletedAt: null },
  { id: "se-stretch", sessionId: "s1", exerciseId: "stretch", deletedAt: null },
  { id: "se-gone", sessionId: "gone", exerciseId: "bench", deletedAt: null },
] as SessionExerciseRow[];

const exercises = [
  { id: "bench", category: "strength" },
  { id: "stretch", category: "warmup" },
] as ExerciseRow[];

function set(
  id: string,
  sessionExerciseId: string,
  weight: string | null,
  extra: Partial<SetRow> = {},
) {
  return {
    id,
    sessionExerciseId,
    kind: "working",
    weight,
    reps: 5,
    supersedesId: null,
    deletedAt: null,
    ...extra,
  } as SetRow;
}

describe("buildProgramProgressSets", () => {
  it("keeps current working sets of live workouts only", () => {
    const result = buildProgramProgressSets(sessions, sessionExercises, exercises, [
      set("a", "se-bench", "100.00"),
      set("b", "se-bench", "105.00", { supersedesId: "a" }),
      set("w", "se-bench", "40.00", { kind: "warmup" }),
      set("d", "se-bench", "90.00", { deletedAt: new Date() }),
      set("x", "se-stretch", null),
      set("g", "se-gone", "200.00"),
    ]);
    expect(result).toEqual([{ sessionId: "s1", exerciseId: "bench", weight: 105, reps: 5 }]);
  });
});
