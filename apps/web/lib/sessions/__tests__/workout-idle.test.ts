import { uuidv7 } from "@jim/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ExerciseRow, type JimDatabase, createTestDb } from "../../db/schema";
import { getDeviceId } from "../../sync/engine";
import { completeSet } from "../set-actions";
import { startEmptySession } from "../start-session";
import { autoEndIdleWorkouts, ownActiveWorkouts } from "../workout-idle";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const BENCH = "bench";
const T0 = new Date("2026-10-19T17:00:00Z");

let testDb: JimDatabase;
let deviceId: string;
// The sync cycle finalize runs: offline here, so it's a no-op.
const offline = (async () => {
  throw new TypeError("offline");
}) as unknown as typeof fetch;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  testDb = createTestDb(`jim-idle-test-${crypto.randomUUID()}`);
  await testDb.exercises.put({
    id: BENCH,
    name: BENCH,
    slug: BENCH,
    trackingType: "weight_reps",
    category: "strength",
  } as ExerciseRow);
  deviceId = await getDeviceId(testDb);
});

afterEach(async () => {
  vi.useRealTimers();
  await testDb.delete();
});

const advanceMinutes = (minutes: number) =>
  vi.setSystemTime(new Date(Date.now() + minutes * 60_000));

async function startWithBench(): Promise<{ sessionId: string; sessionExerciseId: string }> {
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
    updatedAt: new Date(),
    deviceId,
    deletedAt: null,
    serverSeq: 0,
  });
  return { sessionId, sessionExerciseId };
}

async function logSet(sessionExerciseId: string, setIndex: number) {
  await completeSet(
    {
      userId: USER_ID,
      sessionExerciseId,
      exerciseId: BENCH,
      setIndex,
      kind: "working",
      weight: 100,
      reps: 8,
    },
    testDb,
  );
}

describe("idle workouts (issue #648)", () => {
  it("tracks the last set logged as the workout's last activity", async () => {
    const { sessionId, sessionExerciseId } = await startWithBench();
    advanceMinutes(5);
    await logSet(sessionExerciseId, 0);
    const loggedAt = new Date();
    advanceMinutes(20);

    const [workout] = await ownActiveWorkouts(deviceId, testDb);
    expect(workout?.session.id).toBe(sessionId);
    expect(workout?.lastActivityAt).toEqual(loggedAt);
  });

  it("leaves another device's workout alone", async () => {
    await startWithBench();
    expect(await ownActiveWorkouts("another-device", testDb)).toEqual([]);
    advanceMinutes(600);
    expect(await autoEndIdleWorkouts("another-device", 60, testDb, offline)).toBe(0);
  });

  it("ends a workout idle past the setting, dated to its last set", async () => {
    const { sessionId, sessionExerciseId } = await startWithBench();
    advanceMinutes(10);
    await logSet(sessionExerciseId, 0);
    const lastSetAt = new Date();

    advanceMinutes(59);
    expect(await autoEndIdleWorkouts(deviceId, 60, testDb, offline)).toBe(0);
    expect((await testDb.sessions.get(sessionId))?.endedAt).toBeNull();

    advanceMinutes(1);
    expect(await autoEndIdleWorkouts(deviceId, 60, testDb, offline)).toBe(1);
    const ended = await testDb.sessions.get(sessionId);
    expect(ended?.endedAt).toEqual(lastSetAt);
    expect(ended?.deletedAt).toBeNull();
    expect(await ownActiveWorkouts(deviceId, testDb)).toEqual([]);
  });

  it("never ends a workout with auto-end off", async () => {
    const { sessionId } = await startWithBench();
    advanceMinutes(600);
    expect(await autoEndIdleWorkouts(deviceId, null, testDb, offline)).toBe(0);
    expect((await testDb.sessions.get(sessionId))?.endedAt).toBeNull();
  });

  it("discards an idle workout with nothing logged, like Finish does", async () => {
    const { sessionId } = await startWithBench();
    advanceMinutes(61);
    expect(await autoEndIdleWorkouts(deviceId, 60, testDb, offline)).toBe(1);
    expect((await testDb.sessions.get(sessionId))?.deletedAt).not.toBeNull();
  });
});
