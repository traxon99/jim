import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ExerciseRow,
  type JimDatabase,
  type RoutineExerciseRow,
  type RoutineRow,
  createTestDb,
} from "../../db/schema";
import { saveLiftTempos, tempoGroups } from "../tempo-groups";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const LONG_AGO = new Date("2026-01-01T00:00:00Z");

function exercise(id: string, category: ExerciseRow["category"] = "strength"): ExerciseRow {
  return {
    id,
    slug: id,
    ownerId: null,
    name: id,
    aliases: [],
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    equipment: "barbell",
    mechanic: null,
    force: null,
    level: null,
    trackingType: "weight_reps",
    category,
    instructions: [],
    imageUrls: [],
    videoUrl: null,
    isArchived: false,
    createdAt: LONG_AGO,
    updatedAt: LONG_AGO,
    deviceId: "",
    serverSeq: 0,
  };
}

function routine(id: string, kind: RoutineRow["kind"] = "strength"): RoutineRow {
  return {
    id,
    userId: USER_ID,
    name: id,
    notes: null,
    position: 0,
    folder: null,
    kind,
    warmupRoutineId: null,
    warmupMinutes: null,
    oneOff: false,
    oneOffExpiresAt: null,
    oneOffDay: null,
    iconShape: "square",
    iconColor: "blue",
    createdAt: LONG_AGO,
    updatedAt: LONG_AGO,
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
  };
}

function item(
  routineId: string,
  exerciseId: string,
  position: number,
  tempo: string | null = null,
): RoutineExerciseRow {
  return {
    id: `${routineId}-${exerciseId}`,
    userId: USER_ID,
    routineId,
    exerciseId,
    position,
    supersetGroup: null,
    targetSets: 3,
    targetRepsLow: 8,
    targetRepsHigh: 12,
    targetRestSeconds: 120,
    targetDurationSeconds: null,
    targetWeight: null,
    progressionRule: null,
    tempo,
    notes: null,
    updatedAt: LONG_AGO,
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
  };
}

const EXERCISES = [
  exercise("bench"),
  exercise("squat"),
  exercise("rower", "cardio"),
  exercise("circles", "warmup"),
];

describe("tempoGroups (#850)", () => {
  it("lists each routine's lifts in order, once per routine, without warm-ups or cardio", () => {
    const routines = [routine("push"), routine("legs"), routine("prep", "warmup")];
    const items = [
      item("push", "bench", 1, "3-1-1"),
      item("push", "circles", 0),
      item("legs", "rower", 1),
      item("legs", "squat", 0),
      item("prep", "bench", 0),
      { ...item("legs", "bench", 2), deletedAt: LONG_AGO },
    ];
    const groups = tempoGroups(["push", "prep", "legs", "push"], routines, items, EXERCISES);
    expect(
      groups.map((group) => [group.routine.id, group.lifts.map((lift) => lift.item.id)]),
    ).toEqual([
      ["push", ["push-bench"]],
      ["legs", ["legs-squat"]],
    ]);
  });

  it("leaves out a routine with no lifts, or one that's gone", () => {
    const routines = [routine("cardio"), { ...routine("old"), deletedAt: LONG_AGO }];
    const items = [item("cardio", "rower", 0), item("old", "bench", 0)];
    expect(tempoGroups(["cardio", "old", "missing"], routines, items, EXERCISES)).toEqual([]);
  });
});

describe("saveLiftTempos (#850)", () => {
  let testDb: JimDatabase;

  beforeEach(() => {
    testDb = createTestDb(`jim-tempo-groups-test-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it("saves the tempo on lifts that don't have it, and queues only those", async () => {
    const items = [item("push", "bench", 0, "3-1-1"), item("push", "squat", 1)];
    await testDb.routineExercises.bulkPut(items);

    await saveLiftTempos(items, "3-1-1", testDb);

    const saved = await testDb.routineExercises.toArray();
    expect(saved.map((row) => row.tempo)).toEqual(["3-1-1", "3-1-1"]);
    const outbox = await testDb.outbox.toArray();
    expect(outbox.map((entry) => (entry.entity as RoutineExerciseRow).id)).toEqual(["push-squat"]);
  });

  it("clears with null", async () => {
    const items = [item("push", "bench", 0, "3-1-1")];
    await testDb.routineExercises.bulkPut(items);
    await saveLiftTempos(items, null, testDb);
    expect((await testDb.routineExercises.get("push-bench"))?.tempo).toBeNull();
  });
});
