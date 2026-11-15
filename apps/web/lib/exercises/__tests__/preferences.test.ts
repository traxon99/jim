import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type JimDatabase, createTestDb } from "../../db/schema";
import { loadExercisePreferences, setExercisePreference } from "../preferences";

const USER_ID = "11111111-1111-1111-1111-111111111111";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-preferences-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

describe("setExercisePreference (issue #795)", () => {
  it("writes through the outbox and reuses the live row", async () => {
    await setExercisePreference(USER_ID, "barbell-squat", "like", testDb);
    await setExercisePreference(USER_ID, "barbell-squat", "dislike", testDb);
    const rows = await testDb.exercisePreferences.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ exerciseSlug: "barbell-squat", preference: "dislike" });
    expect((await testDb.outbox.toArray()).map((entry) => entry.table)).toEqual([
      "exercisePreferences",
      "exercisePreferences",
    ]);
    expect([...(await loadExercisePreferences(testDb))]).toEqual([["barbell-squat", "dislike"]]);
  });

  it("None tombstones the row", async () => {
    await setExercisePreference(USER_ID, "leg-press", "like", testDb);
    await setExercisePreference(USER_ID, "leg-press", null, testDb);
    expect((await loadExercisePreferences(testDb)).size).toBe(0);
    const [row] = await testDb.exercisePreferences.toArray();
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });
});
