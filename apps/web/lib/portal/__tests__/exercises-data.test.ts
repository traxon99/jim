import type {
  ExerciseRow,
  PersonalRecordRow,
  SessionExerciseRow,
  SessionRow,
  SetRow,
} from "@/lib/db/schema";
import { describe, expect, it } from "vitest";
import {
  buildExerciseIndex,
  buildPortalExerciseDetail,
  exerciseMatchesSearch,
} from "../exercises-data";

const sessions = [
  { id: "s1", deletedAt: null },
  { id: "s2", deletedAt: null },
  { id: "s-deleted", deletedAt: new Date() },
] as SessionRow[];
const sessionExercises = [
  { id: "se1", sessionId: "s1", exerciseId: "bench", deletedAt: null },
  { id: "se2", sessionId: "s2", exerciseId: "bench", deletedAt: null },
  { id: "se-run", sessionId: "s2", exerciseId: "run", deletedAt: null },
  { id: "se-gone", sessionId: "s-deleted", exerciseId: "bench", deletedAt: null },
  { id: "se-removed", sessionId: "s1", exerciseId: "fly", deletedAt: new Date() },
] as SessionExerciseRow[];

function set(overrides: Partial<SetRow>): SetRow {
  return {
    id: "x",
    sessionExerciseId: "se1",
    kind: "working",
    weight: "200.00",
    reps: 5,
    durationSeconds: null,
    distance: null,
    rpe: null,
    restSeconds: null,
    restTargetSeconds: null,
    completedAt: new Date("2026-03-01T18:00:00Z"),
    supersedesId: null,
    deletedAt: null,
    ...overrides,
  } as SetRow;
}

const sets = [
  set({ id: "a", kind: "warmup", weight: "100.00" }),
  set({ id: "b", rpe: "8.0" }),
  set({ id: "c", sessionExerciseId: "se2", completedAt: new Date("2026-03-05T18:00:00Z") }),
  set({
    id: "c2",
    sessionExerciseId: "se2",
    supersedesId: "c",
    weight: "210.00",
    completedAt: new Date("2026-03-05T18:00:00Z"),
  }),
  set({
    id: "run1",
    sessionExerciseId: "se-run",
    weight: null,
    reps: null,
    durationSeconds: 1500,
    distance: "5.00",
  }),
  set({ id: "gone", sessionExerciseId: "se-gone" }),
  set({ id: "removed", sessionExerciseId: "se-removed" }),
];

const bench = {
  id: "bench",
  name: "Bench Press",
  category: "strength",
  isArchived: false,
  equipment: "barbell",
  primaryMuscles: ["chest"],
  secondaryMuscles: [],
  instructions: ["Lie down", "Press"],
  imageUrls: [],
  videoUrl: null,
  trackingType: "weight_reps",
  machineBrand: null,
  machineModel: null,
  pulleyType: null,
} as unknown as ExerciseRow;
const run = { ...bench, id: "run", name: "Run", category: "cardio" } as unknown as ExerciseRow;
const fly = { ...bench, id: "fly", name: "Fly" } as unknown as ExerciseRow;

describe("buildExerciseIndex", () => {
  it("lists every exercise with a live set, cardio included, latest first", () => {
    const rows = buildExerciseIndex(sessions, sessionExercises, [bench, run, fly], sets);
    expect(rows.map((row) => [row.id, row.category, row.workouts])).toEqual([
      ["bench", "strength", 2],
      ["run", "cardio", 1],
    ]);
    expect(rows[0]?.lastDoneAt).toBe("2026-03-05T18:00:00.000Z");
  });

  it("searches by every word of the name", () => {
    expect(exerciseMatchesSearch({ name: "Barbell Bench Press" }, "bench bar")).toBe(true);
    expect(exerciseMatchesSearch({ name: "Barbell Bench Press" }, "squat")).toBe(false);
  });
});

describe("buildPortalExerciseDetail", () => {
  it("returns the exercise's current sets in live workouts, oldest first", () => {
    const detail = buildPortalExerciseDetail(
      bench,
      sessions,
      sessionExercises,
      sets,
      [
        {
          id: "pr",
          exerciseId: "bench",
          kind: "1rm",
          value: "245.00",
          setId: "c2",
          achievedAt: new Date(),
          deletedAt: null,
        },
        {
          id: "pr-other",
          exerciseId: "run",
          kind: "1rm",
          value: "1.00",
          setId: null,
          achievedAt: new Date(),
          deletedAt: null,
        },
      ] as PersonalRecordRow[],
      { name: "Iron Works", deletedAt: null },
    );
    expect(detail?.sets.map((s) => s.id)).toEqual(["a", "b", "c2"]);
    expect(detail?.sets.map((s) => s.sessionId)).toEqual(["s1", "s1", "s2"]);
    expect(detail?.sets[1]?.rpe).toBe(8);
    expect(detail?.sets[2]?.weight).toBe(210);
    expect(detail?.records.map((r) => r.id)).toEqual(["pr"]);
    expect(detail?.gymName).toBe("Iron Works");
    expect(detail?.exercise.instructions).toEqual(["Lie down", "Press"]);
  });

  it("is null for a missing exercise and hides a deleted gym", () => {
    expect(buildPortalExerciseDetail(undefined, [], [], [], [], undefined)).toBeNull();
    expect(
      buildPortalExerciseDetail(bench, [], [], [], [], { name: "Old", deletedAt: new Date() })
        ?.gymName,
    ).toBeNull();
  });
});
