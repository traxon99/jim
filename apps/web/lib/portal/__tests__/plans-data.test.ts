import type {
  ExerciseRow,
  ProgramRoutineRow,
  ProgramRow,
  RoutineExerciseRow,
  RoutineRow,
} from "@/lib/db/schema";
import { describe, expect, it } from "vitest";
import { buildPortalPlansData } from "../plans-data";

const routine = (overrides: Partial<RoutineRow>) =>
  ({
    id: "r1",
    name: "Push",
    notes: null,
    folder: null,
    position: 0,
    kind: "strength",
    warmupRoutineId: null,
    iconShape: "square",
    iconColor: "red",
    deletedAt: null,
    ...overrides,
  }) as RoutineRow;

const item = (overrides: Partial<RoutineExerciseRow>) =>
  ({
    id: "i1",
    routineId: "r1",
    exerciseId: "bench",
    position: 0,
    supersetGroup: null,
    targetSets: 3,
    targetRepsLow: 5,
    targetRepsHigh: 7,
    targetRestSeconds: 120,
    targetDurationSeconds: null,
    targetWeight: "185.00",
    notes: null,
    deletedAt: null,
    ...overrides,
  }) as RoutineExerciseRow;

const exercises = [
  { id: "bench", name: "Bench Press", category: "strength", trackingType: "weight_reps" },
  { id: "fly", name: "Cable Fly", category: "strength", trackingType: "weight_reps" },
] as ExerciseRow[];

function build() {
  return buildPortalPlansData({
    units: "lb",
    weekStart: 1,
    routines: [
      routine({ warmupRoutineId: "gone" }),
      routine({ id: "gone", name: "Old", deletedAt: new Date() }),
    ],
    routineExercises: [
      item({ id: "i2", position: 1, exerciseId: "fly", supersetGroup: 1, targetWeight: null }),
      item({ id: "i3", position: 2, exerciseId: "bench", supersetGroup: 1 }),
      item({}),
      item({ id: "dead", deletedAt: new Date() }),
    ],
    exercises,
    programs: [
      {
        id: "p1",
        name: "PPL",
        mode: "weekly",
        isActive: true,
        notes: null,
        position: 0,
        durationWeeks: 8,
        activatedAt: new Date("2026-09-01T00:00:00Z"),
        deletedAt: null,
      } as ProgramRow,
      { id: "p2", name: "Deleted", deletedAt: new Date(), position: 1 } as ProgramRow,
    ],
    programRoutines: [
      {
        id: "pr2",
        programId: "p1",
        routineId: null,
        position: 1,
        weekday: 3,
        deletedAt: null,
      } as ProgramRoutineRow,
      {
        id: "pr1",
        programId: "p1",
        routineId: "r1",
        position: 0,
        weekday: 1,
        deletedAt: null,
      } as ProgramRoutineRow,
      {
        id: "pr3",
        programId: "p1",
        routineId: "gone",
        position: 2,
        weekday: 5,
        deletedAt: null,
      } as ProgramRoutineRow,
    ],
    sessions: [
      {
        routineId: "r1",
        startedAt: new Date("2026-10-01T10:00:00Z"),
        endedAt: new Date("2026-10-01T11:00:00Z"),
        deletedAt: null,
      },
      {
        routineId: "r1",
        startedAt: new Date("2026-10-05T10:00:00Z"),
        endedAt: null,
        deletedAt: null,
      },
    ],
    scheduled: [
      {
        id: "s2",
        routineId: "r1",
        scheduledFor: new Date("2026-10-20T17:00:00Z"),
        notes: null,
        deletedAt: null,
      },
      {
        id: "s1",
        routineId: null,
        scheduledFor: new Date("2026-10-14T17:00:00Z"),
        notes: "Easy day",
        deletedAt: null,
      },
      {
        id: "s0",
        routineId: "r1",
        scheduledFor: new Date("2026-10-13T17:00:00Z"),
        notes: null,
        deletedAt: new Date(),
      },
    ],
  });
}

describe("buildPortalPlansData", () => {
  it("lists live routines with summarized targets and superset labels, in order", () => {
    const [push] = build().routines;
    expect(build().routines).toHaveLength(1);
    expect(push?.items.map((i) => [i.name, i.summary, i.supersetLabel])).toEqual([
      ["Bench Press", "3 × 5–7 · 185 lb · 2:00 rest", null],
      ["Cable Fly", "3 × 5–7 · 2:00 rest", "A1"],
      ["Bench Press", "3 × 5–7 · 185 lb · 2:00 rest", "A2"],
    ]);
    expect(push?.warmupRoutineId).toBeNull();
    expect(push?.lastDoneAt).toBe("2026-10-01T10:00:00.000Z");
  });

  it("keeps live programs with their schedule in order, rest days included", () => {
    const { programs } = build();
    expect(programs.map((p) => p.name)).toEqual(["PPL"]);
    expect(programs[0]?.items).toEqual([
      { id: "pr1", routineId: "r1", weekday: 1 },
      { id: "pr2", routineId: null, weekday: 3 },
    ]);
  });

  it("lists scheduled workouts soonest first, without deleted ones", () => {
    expect(build().scheduled.map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});
