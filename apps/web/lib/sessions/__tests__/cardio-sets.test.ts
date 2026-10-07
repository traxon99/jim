import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ExerciseRow, type JimDatabase, createTestDb } from "../../db/schema";
import { completeSet } from "../set-actions";
import { startEmptySession } from "../start-session";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const RUN = "run";

let testDb: JimDatabase;

beforeEach(async () => {
  testDb = createTestDb(`jim-cardio-test-${crypto.randomUUID()}`);
  await testDb.exercises.put({
    id: RUN,
    name: "Running (Outdoor)",
    slug: RUN,
    trackingType: "distance_time",
    category: "cardio",
  } as ExerciseRow);
});

afterEach(async () => {
  await testDb.delete();
});

describe("cardio sets (issue #423)", () => {
  it("stores distance and time, and never records strength PRs", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExerciseId = crypto.randomUUID();
    await testDb.sessionExercises.put({
      id: sessionExerciseId,
      userId: USER_ID,
      sessionId,
      exerciseId: RUN,
      position: 0,
      deletedAt: null,
    } as Parameters<typeof testDb.sessionExercises.put>[0]);

    const { set, prs } = await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId,
        exerciseId: RUN,
        setIndex: 0,
        kind: "working",
        weight: null,
        reps: null,
        distance: 5,
        durationSeconds: 1500,
      },
      testDb,
    );

    expect(set).toMatchObject({ distance: "5", durationSeconds: 1500, weight: null, reps: null });
    expect(prs).toEqual([]);
    expect(await testDb.personalRecords.count()).toBe(0);
  });
});
