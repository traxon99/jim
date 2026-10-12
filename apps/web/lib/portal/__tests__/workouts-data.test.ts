import type {
  ExerciseRow,
  PersonalRecordRow,
  SessionExerciseRow,
  SessionRow,
  SetRow,
} from "@/lib/db/schema";
import { describe, expect, it } from "vitest";
import {
  type PortalWorkoutRow,
  buildPortalWorkoutDetail,
  buildPortalWorkoutRows,
  workoutMatchesSearch,
} from "../workouts-data";

const STARTED = new Date("2026-03-02T17:00:00.000Z");
const ENDED = new Date("2026-03-02T18:05:00.000Z");

function session(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "s1",
    name: "Push day",
    startedAt: STARTED,
    endedAt: ENDED,
    notes: null,
    gymId: "gym-1",
    deletedAt: null,
    ...overrides,
  } as SessionRow;
}

function sessionExercise(overrides: Partial<SessionExerciseRow> = {}): SessionExerciseRow {
  return {
    id: "se-bench",
    sessionId: "s1",
    exerciseId: "bench",
    position: 0,
    supersetGroup: null,
    notes: null,
    deletedAt: null,
    ...overrides,
  } as SessionExerciseRow;
}

function set(overrides: Partial<SetRow> = {}): SetRow {
  return {
    id: "set-1",
    sessionExerciseId: "se-bench",
    setIndex: 0,
    kind: "working",
    weight: "200.00",
    reps: 5,
    durationSeconds: null,
    distance: null,
    rpe: null,
    restSeconds: null,
    restTargetSeconds: null,
    completedAt: STARTED,
    supersedesId: null,
    deletedAt: null,
    ...overrides,
  } as SetRow;
}

const exercises = [
  { id: "bench", name: "Bench Press", primaryMuscles: ["chest"] },
  { id: "fly", name: "Cable Fly", primaryMuscles: ["chest"] },
  { id: "row", name: "Row", primaryMuscles: ["back"] },
] as ExerciseRow[];

const gyms = [
  { id: "gym-1", name: "Iron Works", deletedAt: null },
  { id: "gym-gone", name: "Old Gym", deletedAt: new Date() },
];

const pr = {
  id: "pr-1",
  exerciseId: "bench",
  kind: "1rm",
  setId: "set-2",
  deletedAt: null,
} as PersonalRecordRow;

describe("buildPortalWorkoutRows", () => {
  const sets = [
    set({ id: "set-w", kind: "warmup", weight: "100.00", reps: 10, setIndex: 0 }),
    set({ id: "set-1", setIndex: 1 }),
    set({ id: "set-2", setIndex: 2, weight: "210.00" }),
  ];

  it("lists finished workouts with History's numbers, newest first", () => {
    const rows = buildPortalWorkoutRows(
      [
        session(),
        session({ id: "s2", name: null, startedAt: new Date("2026-03-05T17:00:00Z") }),
        session({ id: "s-open", endedAt: null }),
        session({ id: "s-deleted", deletedAt: new Date() }),
      ],
      [sessionExercise(), sessionExercise({ id: "se-row", sessionId: "s2", exerciseId: "row" })],
      exercises,
      [...sets, set({ id: "set-row", sessionExerciseId: "se-row" })],
      [pr],
      gyms,
    );

    expect(rows.map((row) => row.id)).toEqual(["s2", "s1"]);
    const push = rows[1] as PortalWorkoutRow;
    expect(push).toMatchObject({
      name: "Push day",
      gymName: "Iron Works",
      durationSeconds: 65 * 60,
      // Every current set counts, warm-ups included, as on the phone.
      // The warm-up counts toward neither (issue #494).
      setCount: 2,
      totalVolume: 200 * 5 + 210 * 5,
      prCount: 1,
      exerciseNames: ["Bench Press"],
    });
    // An unnamed workout gets History's derived name.
    expect(rows[0]?.name).toContain("Back");
  });

  it("treats a deleted gym as none", () => {
    const [row] = buildPortalWorkoutRows(
      [session({ gymId: "gym-gone" })],
      [sessionExercise()],
      exercises,
      sets,
      [],
      gyms,
    );
    expect(row?.gymName).toBeNull();
  });
});

describe("workoutMatchesSearch", () => {
  const row: PortalWorkoutRow = {
    id: "s1",
    name: "Push day",
    startedAt: STARTED.toISOString(),
    durationSeconds: 0,
    gymName: "Iron Works",
    setCount: 0,
    totalVolume: 0,
    prCount: 0,
    exerciseNames: ["Bench Press", "Cable Fly"],
  };

  it("matches name, gym and exercises, every word, any case", () => {
    expect(workoutMatchesSearch(row, "")).toBe(true);
    expect(workoutMatchesSearch(row, "push")).toBe(true);
    expect(workoutMatchesSearch(row, "iron")).toBe(true);
    expect(workoutMatchesSearch(row, "fly bench")).toBe(true);
    expect(workoutMatchesSearch(row, "squat")).toBe(false);
    expect(workoutMatchesSearch(row, "push squat")).toBe(false);
  });
});

describe("buildPortalWorkoutDetail", () => {
  it("shows every set with its kind, RPE, PRs and supersets", () => {
    const detail = buildPortalWorkoutDetail(
      session({ notes: "Felt strong" }),
      [
        sessionExercise({ supersetGroup: 1 }),
        sessionExercise({ id: "se-fly", exerciseId: "fly", position: 1, supersetGroup: 1 }),
        sessionExercise({ id: "se-row", exerciseId: "row", position: 2 }),
        sessionExercise({
          id: "se-removed",
          exerciseId: "row",
          position: 3,
          deletedAt: new Date(),
        }),
      ],
      exercises,
      [
        set({ id: "set-w", kind: "warmup", setIndex: 0, weight: "100.00", reps: 10 }),
        set({ id: "set-1", setIndex: 1, rpe: "8.5" }),
        set({ id: "set-2", setIndex: 2, kind: "failure", weight: "210.00" }),
        set({ id: "set-fly", sessionExerciseId: "se-fly" }),
        set({ id: "set-row", sessionExerciseId: "se-row" }),
      ],
      [pr],
      gyms,
    );

    expect(detail).not.toBeNull();
    expect(detail?.notes).toBe("Felt strong");
    expect(detail?.gymName).toBe("Iron Works");
    // Working sets only: the warm-up is listed but not counted (issue #494).
    expect(detail?.setCount).toBe(4);
    expect(detail?.prCount).toBe(1);
    expect(detail?.exercises.map((exercise) => exercise.supersetLabel)).toEqual(["A1", "A2", null]);
    const bench = detail?.exercises[0];
    expect(bench?.sets.map((s) => s.kind)).toEqual(["warmup", "working", "failure"]);
    expect(bench?.sets.map((s) => s.rpe)).toEqual([null, 8.5, null]);
    expect(bench?.sets[2]?.prKinds).toEqual(["1rm"]);
  });

  it("is null for a missing or deleted workout", () => {
    expect(buildPortalWorkoutDetail(undefined, [], exercises, [], [], gyms)).toBeNull();
    expect(
      buildPortalWorkoutDetail(session({ deletedAt: new Date() }), [], exercises, [], [], gyms),
    ).toBeNull();
  });
});
