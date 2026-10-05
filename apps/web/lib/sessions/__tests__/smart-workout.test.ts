import { uuidv7 } from "@jim/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ExerciseRow, type JimDatabase, createTestDb } from "../../db/schema";
import { completeSet } from "../set-actions";
import { SMART_WORKOUT_NAME, startSmartSession } from "../smart-workout";
import { startEmptySession } from "../start-session";

const USER_ID = "11111111-1111-1111-1111-111111111111";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-smart-workout-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

function exercise(slug: string, primaryMuscles: string[], overrides: Partial<ExerciseRow> = {}) {
  const row: ExerciseRow = {
    id: uuidv7(),
    ownerId: null,
    slug,
    name: slug,
    aliases: [],
    primaryMuscles: primaryMuscles as ExerciseRow["primaryMuscles"],
    secondaryMuscles: [],
    equipment: "barbell",
    mechanic: "compound",
    force: null,
    level: "beginner",
    trackingType: "weight_reps",
    category: "strength",
    instructions: [],
    imageUrls: [],
    videoUrl: null,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deviceId: "",
    serverSeq: 0,
    ...overrides,
  };
  return row;
}

async function logSets(exerciseRow: ExerciseRow, count: number, kind: "working" | "warmup") {
  const sessionId = await startEmptySession(USER_ID, testDb);
  const sessionExerciseId = uuidv7();
  await testDb.sessionExercises.put({
    id: sessionExerciseId,
    userId: USER_ID,
    sessionId,
    exerciseId: exerciseRow.id,
    position: 0,
    supersetGroup: null,
    notes: null,
    stickyNote: null,
    restSeconds: null,
    warmupSets: null,
    updatedAt: new Date(),
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
  });
  for (let setIndex = 0; setIndex < count; setIndex++) {
    await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId,
        exerciseId: exerciseRow.id,
        setIndex,
        kind,
        weight: 100,
        reps: 5,
      },
      testDb,
    );
  }
  const session = await testDb.sessions.get(sessionId);
  if (session) await testDb.sessions.put({ ...session, endedAt: new Date() });
}

describe("startSmartSession", () => {
  it("starts a named session aimed at the muscles trained least this week", async () => {
    const bench = exercise("bench", ["chest"]);
    const squat = exercise("squat", ["quadriceps"]);
    const stretch = exercise("warmup-stretch", ["quadriceps"], { category: "warmup" });
    const archived = exercise("old-leg-press", ["quadriceps"], { isArchived: true });
    await testDb.exercises.bulkPut([bench, squat, stretch, archived]);
    // Plenty of chest recently — but three days ago, so it's recovered.
    await logSets(bench, 12, "working");
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    for (const set of await testDb.sets.toArray()) {
      await testDb.sets.put({ ...set, completedAt: threeDaysAgo });
    }

    const sessionId = await startSmartSession(USER_ID, testDb);

    const session = await testDb.sessions.get(sessionId);
    expect(session?.name).toBe(SMART_WORKOUT_NAME);
    expect(session?.routineId).toBeNull();
    const items = (
      await testDb.sessionExercises.where("sessionId").equals(sessionId).toArray()
    ).sort((a, b) => a.position - b.position);
    // Squat for the untrained quads comes before the already-worked chest;
    // warm-ups and archived exercises are never picked.
    expect(items.map((item) => item.exerciseId)).toEqual([squat.id, bench.id]);
  });

  it("doesn't count warm-up sets as volume", async () => {
    const bench = exercise("bench", ["chest"]);
    const row = exercise("row", ["middle back"]);
    await testDb.exercises.bulkPut([bench, row]);
    // Lots of chest warm-up sets four days ago: chest still counts as untrained.
    await logSets(bench, 20, "warmup");
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    for (const set of await testDb.sets.toArray()) {
      await testDb.sets.put({ ...set, completedAt: fourDaysAgo });
    }

    const sessionId = await startSmartSession(USER_ID, testDb);
    const items = await testDb.sessionExercises.where("sessionId").equals(sessionId).toArray();
    // Chest (target 10) and middle back (8) both at zero — bigger target first.
    expect(items.sort((a, b) => a.position - b.position).map((item) => item.exerciseId)).toEqual([
      bench.id,
      row.id,
    ]);
  });
});
