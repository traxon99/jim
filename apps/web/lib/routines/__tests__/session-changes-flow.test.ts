import { completeSet } from "@/lib/sessions/set-actions";
import { startSessionFromRoutine } from "@/lib/sessions/start-session";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ExerciseRow,
  type JimDatabase,
  type RoutineExerciseRow,
  type RoutineRow,
  createTestDb,
} from "../../db/schema";
import {
  compareSessionToRoutine,
  describeRoutineChanges,
  saveSessionChangesToRoutine,
} from "../session-changes";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const LONG_AGO = new Date("2026-01-01T00:00:00Z");

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-session-changes-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

function exercise(id: string): ExerciseRow {
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
    category: "strength",
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

const ROUTINE: RoutineRow = {
  id: "push",
  userId: USER_ID,
  name: "Push day",
  notes: null,
  position: 0,
  folder: null,
  kind: "strength",
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

function routineExercise(exerciseId: string, position: number): RoutineExerciseRow {
  return {
    id: `row-${exerciseId}`,
    userId: USER_ID,
    routineId: ROUTINE.id,
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
    notes: null,
    updatedAt: LONG_AGO,
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
  };
}

async function seedRoutine() {
  await testDb.exercises.bulkPut(["bench", "fly", "dips", "raise"].map((id) => exercise(id)));
  await testDb.routines.put(ROUTINE);
  const items = ["bench", "fly", "dips"].map(routineExercise);
  await testDb.routineExercises.bulkPut(items);
  return items;
}

async function finish(sessionId: string) {
  const session = await testDb.sessions.get(sessionId);
  if (!session) throw new Error("session missing");
  const ended = { ...session, endedAt: new Date() };
  await testDb.sessions.put(ended);
  return ended;
}

describe("saving a workout's changes to its routine (against Dexie)", () => {
  it("offers nothing when the workout followed the routine", async () => {
    const items = await seedRoutine();
    const sessionId = await startSessionFromRoutine(USER_ID, ROUTINE, items, testDb);
    expect(await compareSessionToRoutine(await finish(sessionId), testDb)).toBeNull();
  });

  it("swaps out a removed exercise for an added one, keeping the rest's targets", async () => {
    const items = await seedRoutine();
    const sessionId = await startSessionFromRoutine(USER_ID, ROUTINE, items, testDb);
    const sessionItems = await testDb.sessionExercises
      .where("sessionId")
      .equals(sessionId)
      .toArray();
    const fly = sessionItems.find((se) => se.exerciseId === "fly");
    if (!fly) throw new Error("fly missing");
    // Replace Exercise on the ⋯ menu (fly → lateral raise), then log two sets.
    await testDb.sessionExercises.put({ ...fly, exerciseId: "raise", restSeconds: 60 });
    for (const setIndex of [0, 1]) {
      await completeSet(
        {
          userId: USER_ID,
          sessionExerciseId: fly.id,
          exerciseId: "raise",
          setIndex,
          kind: "working",
          weight: 10,
          reps: 12,
        },
        testDb,
      );
    }

    const comparison = await compareSessionToRoutine(await finish(sessionId), testDb);
    if (!comparison) throw new Error("expected changes");
    expect(describeRoutineChanges(comparison.changes, (id) => id)).toEqual([
      "Added raise",
      "Removed fly",
    ]);

    await saveSessionChangesToRoutine(USER_ID, comparison, testDb);
    const live = (await testDb.routineExercises.where("routineId").equals(ROUTINE.id).toArray())
      .filter((item) => !item.deletedAt)
      .sort((a, b) => a.position - b.position)
      .map((item) => [item.exerciseId, item.position, item.targetSets, item.targetRestSeconds]);
    expect(live).toEqual([
      ["bench", 0, 3, 120],
      ["raise", 1, 2, 60],
      ["dips", 2, 3, 120],
    ]);

    // Saved, so the summary stops asking.
    const session = await testDb.sessions.get(sessionId);
    if (!session) throw new Error("session missing");
    expect(await compareSessionToRoutine(session, testDb)).toBeNull();
  });

  it("doesn't offer to undo a routine edited after the workout ended", async () => {
    const items = await seedRoutine();
    const sessionId = await startSessionFromRoutine(USER_ID, ROUTINE, items, testDb);
    const sessionItems = await testDb.sessionExercises
      .where("sessionId")
      .equals(sessionId)
      .toArray();
    const dips = sessionItems.find((se) => se.exerciseId === "dips");
    if (!dips) throw new Error("dips missing");
    await testDb.sessionExercises.put({ ...dips, deletedAt: new Date() });
    const ended = await finish(sessionId);

    await testDb.routineExercises.put({
      ...routineExercise("bench", 0),
      updatedAt: new Date(Date.now() + 60_000),
    });
    expect(await compareSessionToRoutine(ended, testDb)).toBeNull();
  });

  it("saves a tempo set or cleared mid-workout into the routine", async () => {
    await seedRoutine();
    const items = [
      { ...routineExercise("bench", 0), tempo: "3-1-1" },
      { ...routineExercise("fly", 1), tempo: "2-0-2" },
      routineExercise("dips", 2),
    ];
    await testDb.routineExercises.bulkPut(items);
    const sessionId = await startSessionFromRoutine(USER_ID, ROUTINE, items, testDb);
    const byExercise = new Map(
      (await testDb.sessionExercises.where("sessionId").equals(sessionId).toArray()).map((se) => [
        se.exerciseId,
        se,
      ]),
    );
    // The ⋯ menu's Tempo: bench gets a new one, fly is cleared, dips gets its first.
    for (const [exerciseId, tempo] of [
      ["bench", "4-0-1"],
      ["fly", ""],
      ["dips", "2-0-X"],
    ] as const) {
      const se = byExercise.get(exerciseId);
      if (!se) throw new Error(`${exerciseId} missing`);
      await testDb.sessionExercises.put({ ...se, tempo });
    }

    const comparison = await compareSessionToRoutine(await finish(sessionId), testDb);
    if (!comparison) throw new Error("expected changes");
    expect(describeRoutineChanges(comparison.changes, (id) => id)).toEqual([
      "Changed tempo for bench, fly, dips",
    ]);
    await saveSessionChangesToRoutine(USER_ID, comparison, testDb);
    const tempos = (await testDb.routineExercises.where("routineId").equals(ROUTINE.id).toArray())
      .sort((a, b) => a.position - b.position)
      .map((item) => [item.exerciseId, item.tempo ?? null]);
    expect(tempos).toEqual([
      ["bench", "4-0-1"],
      ["fly", null],
      ["dips", "2-0-X"],
    ]);
  });

  it("doesn't offer back a tempo the routine changed after the workout started", async () => {
    await seedRoutine();
    const items = [{ ...routineExercise("bench", 0), tempo: "3-1-1" }];
    await testDb.routineExercises.bulkPut(items);
    const sessionId = await startSessionFromRoutine(USER_ID, ROUTINE, items, testDb);
    const session = await testDb.sessions.get(sessionId);
    if (!session) throw new Error("session missing");
    // Edited from Plan mid-workout; the workout keeps the tempo it started with.
    await testDb.routineExercises.put({
      ...items[0],
      tempo: "2-0-2",
      updatedAt: new Date(session.startedAt.getTime() + 1_000),
    } as RoutineExerciseRow);
    const ended = { ...session, endedAt: new Date(session.startedAt.getTime() + 60_000) };
    await testDb.sessions.put(ended);
    const comparison = await compareSessionToRoutine(ended, testDb);
    expect(comparison?.changes.tempoChanged ?? []).toEqual([]);
  });

  it("offers nothing for an empty workout", async () => {
    await seedRoutine();
    const sessionId = await startSessionFromRoutine(USER_ID, ROUTINE, [], testDb);
    expect(await compareSessionToRoutine(await finish(sessionId), testDb)).toBeNull();
  });
});
