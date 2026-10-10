import { uuidv7 } from "@jim/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ExerciseRow,
  type JimDatabase,
  type RoutineExerciseRow,
  createTestDb,
} from "../../db/schema";
import { completeSet, editSet } from "../set-actions";
import { startEmptySession, startSessionFromRoutine } from "../start-session";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const BENCH = "bench";
const ROW = "row";
const STRETCH = "stretch";
const T0 = new Date("2026-03-01T10:00:00Z");

let testDb: JimDatabase;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  testDb = createTestDb(`jim-rest-test-${crypto.randomUUID()}`);
  await testDb.exercises.bulkPut([
    exercise(BENCH, "strength"),
    exercise(ROW, "strength"),
    exercise(STRETCH, "warmup"),
  ]);
});

afterEach(async () => {
  vi.useRealTimers();
  await testDb.delete();
});

function exercise(id: string, category: ExerciseRow["category"]): ExerciseRow {
  return { id, name: id, slug: id, trackingType: "weight_reps", category } as ExerciseRow;
}

function routineItem(
  exerciseId: string,
  position: number,
  rest: number | null,
): RoutineExerciseRow {
  return {
    id: uuidv7(),
    userId: USER_ID,
    routineId: "routine",
    exerciseId,
    position,
    supersetGroup: null,
    targetSets: 3,
    targetRepsLow: 6,
    targetRepsHigh: 8,
    targetRestSeconds: rest,
    targetDurationSeconds: null,
    targetWeight: null,
    progressionRule: null,
    notes: null,
    updatedAt: T0,
    deviceId: "d",
    deletedAt: null,
    serverSeq: 0,
  };
}

async function sessionExerciseIds(sessionId: string): Promise<Map<string, string>> {
  const rows = await testDb.sessionExercises.where("sessionId").equals(sessionId).toArray();
  return new Map(rows.map((row) => [row.exerciseId, row.id]));
}

async function log(sessionExerciseId: string, exerciseId: string, setIndex: number) {
  const { set } = await completeSet(
    {
      userId: USER_ID,
      sessionExerciseId,
      exerciseId,
      setIndex,
      kind: "working",
      weight: 100,
      reps: 8,
    },
    testDb,
  );
  return set;
}

const advance = (seconds: number) => vi.setSystemTime(new Date(Date.now() + seconds * 1000));

describe("rest before each set (issue #233)", () => {
  it("records the rest since the session's last set against the routine's target", async () => {
    const items = [routineItem(BENCH, 0, 180), routineItem(ROW, 1, 60)];
    const sessionId = await startSessionFromRoutine(
      USER_ID,
      { id: "routine", name: "Push" },
      items,
      testDb,
    );
    await testDb.routineExercises.bulkPut(items);
    const ids = await sessionExerciseIds(sessionId);

    const first = await log(ids.get(BENCH) as string, BENCH, 0);
    expect(first.restSeconds).toBeNull();
    expect(first.restTargetSeconds).toBeNull();

    advance(100);
    const second = await log(ids.get(BENCH) as string, BENCH, 1);
    expect(second).toMatchObject({ restSeconds: 100, restTargetSeconds: 180 });

    // Switching exercise: the rest that ran was bench's.
    advance(200);
    const third = await log(ids.get(ROW) as string, ROW, 0);
    expect(third).toMatchObject({ restSeconds: 200, restTargetSeconds: 180 });

    advance(30);
    const fourth = await log(ids.get(ROW) as string, ROW, 1);
    expect(fourth).toMatchObject({ restSeconds: 30, restTargetSeconds: 60 });
  });

  it("falls back to the default rest without a routine target", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExerciseId = uuidv7();
    await testDb.sessionExercises.put({
      id: sessionExerciseId,
      userId: USER_ID,
      sessionId,
      exerciseId: BENCH,
      position: 0,
      supersetGroup: null,
      notes: null,
      stickyNote: null,
      restSeconds: null,
      warmupSets: null,
      updatedAt: T0,
      deviceId: "d",
      deletedAt: null,
      serverSeq: 0,
    });
    await log(sessionExerciseId, BENCH, 0);
    advance(45);
    const second = await log(sessionExerciseId, BENCH, 1);
    expect(second).toMatchObject({ restSeconds: 45, restTargetSeconds: 90 });
  });

  it("has no rest after or for a warm-up exercise", async () => {
    const items = [routineItem(STRETCH, 0, null), routineItem(BENCH, 1, 120)];
    const sessionId = await startSessionFromRoutine(
      USER_ID,
      { id: "routine", name: "Push" },
      items,
      testDb,
    );
    const ids = await sessionExerciseIds(sessionId);

    await log(ids.get(STRETCH) as string, STRETCH, 0);
    advance(20);
    const stretch = await log(ids.get(STRETCH) as string, STRETCH, 1);
    expect(stretch.restSeconds).toBeNull();
    advance(60);
    const bench = await log(ids.get(BENCH) as string, BENCH, 0);
    expect(bench.restSeconds).toBeNull();
  });

  it("uses the exercise's own rest for this workout, and none when it's off", async () => {
    const sessionId = await startSessionFromRoutine(
      USER_ID,
      { id: "routine", name: "Push" },
      [routineItem(BENCH, 0, 120)],
      testDb,
    );
    const ids = await sessionExerciseIds(sessionId);
    const benchId = ids.get(BENCH) as string;
    await testDb.sessionExercises.update(benchId, { restSeconds: 150 });
    await log(benchId, BENCH, 0);
    advance(100);
    expect(await log(benchId, BENCH, 1)).toMatchObject({
      restSeconds: 100,
      restTargetSeconds: 150,
    });

    await testDb.sessionExercises.update(benchId, { restSeconds: 0 });
    advance(20);
    expect((await log(benchId, BENCH, 2)).restSeconds).toBeNull();
  });

  it("has no rest between superset partners mid-round, only after the round", async () => {
    const items = [
      { ...routineItem(BENCH, 0, 90), supersetGroup: 1 },
      { ...routineItem(ROW, 1, 90), supersetGroup: 1 },
    ];
    const sessionId = await startSessionFromRoutine(
      USER_ID,
      { id: "routine", name: "Push" },
      items,
      testDb,
    );
    const ids = await sessionExerciseIds(sessionId);
    await log(ids.get(BENCH) as string, BENCH, 0);
    advance(15);
    expect((await log(ids.get(ROW) as string, ROW, 0)).restSeconds).toBeNull();
    advance(80);
    expect(await log(ids.get(BENCH) as string, BENCH, 1)).toMatchObject({
      restSeconds: 80,
      restTargetSeconds: 90,
    });
  });

  it("keeps a set's rest through an edit", async () => {
    const sessionId = await startSessionFromRoutine(
      USER_ID,
      { id: "routine", name: "Push" },
      [routineItem(BENCH, 0, 120)],
      testDb,
    );
    const ids = await sessionExerciseIds(sessionId);
    await log(ids.get(BENCH) as string, BENCH, 0);
    advance(70);
    const second = await log(ids.get(BENCH) as string, BENCH, 1);
    const edited = await editSet(
      { original: second, weight: 105, reps: 8, kind: "working" },
      testDb,
    );
    expect(edited).toMatchObject({ restSeconds: 70, restTargetSeconds: second.restTargetSeconds });
  });
});

describe("session intensity (issue #235)", () => {
  it("stores the pre-workout pick on the session", async () => {
    const sessionId = await startSessionFromRoutine(
      USER_ID,
      { id: "routine", name: "Push" },
      [routineItem(BENCH, 0, 120)],
      testDb,
      "light",
    );
    expect((await testDb.sessions.get(sessionId))?.intensity).toBe("light");
    const outbox = await testDb.outbox.toArray();
    expect(outbox.find((m) => m.table === "sessions")?.entity).toMatchObject({
      intensity: "light",
    });
  });

  it("leaves it null when nothing was asked", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    expect((await testDb.sessions.get(sessionId))?.intensity).toBeNull();
  });
});

describe("session gym (issue #454)", () => {
  it("stores the pre-workout gym pick on the session and syncs it", async () => {
    const sessionId = await startSessionFromRoutine(
      USER_ID,
      { id: "routine", name: "Push" },
      [routineItem(BENCH, 0, 120)],
      testDb,
      "push",
      "gym-1",
    );
    expect((await testDb.sessions.get(sessionId))?.gymId).toBe("gym-1");
    const outbox = await testDb.outbox.toArray();
    expect(outbox.find((m) => m.table === "sessions")?.entity).toMatchObject({ gymId: "gym-1" });
  });

  it("leaves it null when none was picked", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    expect((await testDb.sessions.get(sessionId))?.gymId).toBeNull();
  });
});
