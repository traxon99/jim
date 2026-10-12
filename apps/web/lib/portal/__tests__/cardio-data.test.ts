import type { SetRow } from "@/lib/db/schema";
import { describe, expect, it } from "vitest";
import {
  buildPortalCardioData,
  cardioRecordRows,
  cardioWorkoutPoints,
  summarizeCardio,
} from "../cardio-data";

const exercises = [
  {
    id: "run",
    name: "Running",
    category: "cardio" as const,
    machineBrand: null,
    machineModel: null,
  },
  {
    id: "row",
    name: "Rowing",
    category: "cardio" as const,
    machineBrand: null,
    machineModel: null,
  },
  {
    id: "bench",
    name: "Bench Press",
    category: "strength" as const,
    machineBrand: null,
    machineModel: null,
  },
];
const sessions = [
  { id: "s1", deletedAt: null },
  { id: "s2", deletedAt: null },
  { id: "gone", deletedAt: new Date() },
];
const sessionExercises = [
  { id: "se1", sessionId: "s1", exerciseId: "run", deletedAt: null },
  { id: "se2", sessionId: "s2", exerciseId: "run", deletedAt: null },
  { id: "se3", sessionId: "s1", exerciseId: "bench", deletedAt: null },
  { id: "se4", sessionId: "gone", exerciseId: "row", deletedAt: null },
];

function set(overrides: Partial<SetRow>) {
  return {
    id: "x",
    sessionExerciseId: "se1",
    completedAt: new Date("2026-10-01T10:00:00Z"),
    distance: null,
    durationSeconds: null,
    supersedesId: null,
    deletedAt: null,
    ...overrides,
  } as Pick<
    SetRow,
    | "id"
    | "sessionExerciseId"
    | "completedAt"
    | "distance"
    | "durationSeconds"
    | "supersedesId"
    | "deletedAt"
  >;
}

const data = buildPortalCardioData(
  sessions,
  sessionExercises,
  exercises,
  [
    set({ id: "a", distance: "2.00", durationSeconds: 1200 }),
    set({ id: "b", distance: "1.00", durationSeconds: 480 }),
    set({
      id: "c",
      sessionExerciseId: "se2",
      distance: "5.00",
      durationSeconds: 3000,
      completedAt: new Date("2026-10-05T10:00:00Z"),
    }),
    set({
      id: "c2",
      sessionExerciseId: "se2",
      distance: "5.50",
      durationSeconds: 2750,
      supersedesId: "c",
      completedAt: new Date("2026-10-05T10:00:00Z"),
    }),
    set({ id: "bench", sessionExerciseId: "se3", durationSeconds: 60 }),
    set({ id: "deleted-workout", sessionExerciseId: "se4", distance: "3.00" }),
    set({ id: "empty", durationSeconds: 0 }),
  ],
  "lb",
);

describe("buildPortalCardioData", () => {
  it("keeps current cardio sets from live workouts only", () => {
    expect(data.sets.map((s) => s.durationSeconds)).toEqual([1200, 480, 2750]);
    expect(data.exercises).toEqual([{ id: "run", name: "Running" }]);
  });
});

describe("cardioWorkoutPoints and summarizeCardio", () => {
  it("sums each workout and paces it from sets with both values", () => {
    const points = cardioWorkoutPoints(data.sets);
    expect(points.map((p) => [p.sessionId, p.distance, p.durationSeconds])).toEqual([
      ["s1", 3, 1680],
      ["s2", 5.5, 2750],
    ]);
    expect(points[0]?.paceSeconds).toBe(560);
    const summary = summarizeCardio(points);
    expect(summary).toMatchObject({ workouts: 2, distance: 8.5, durationSeconds: 4430 });
    expect(summary.paceSeconds).toBeCloseTo(4430 / 8.5);
  });
});

describe("cardioRecordRows", () => {
  it("gives each exercise its all-time bests", () => {
    const [row] = cardioRecordRows(data);
    expect(row).toMatchObject({
      exerciseId: "run",
      workouts: 2,
      bests: { distance: 5.5, durationSeconds: 2750, paceSeconds: 480 },
    });
  });
});
