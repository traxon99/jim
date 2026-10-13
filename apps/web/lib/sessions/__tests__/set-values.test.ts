import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type JimDatabase, createTestDb } from "../../db/schema";
import { SetValueError, completeSet } from "../set-actions";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-set-values-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

describe("set values the server can't store (#500)", () => {
  it("refuses an overflowing weight before anything is queued", async () => {
    await expect(
      completeSet(
        {
          userId: "u1",
          sessionExerciseId: "se1",
          exerciseId: "e1",
          setIndex: 0,
          kind: "working",
          weight: 100_000,
          reps: 5,
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(SetValueError);
    expect(await testDb.outbox.count()).toBe(0);
    expect(await testDb.sets.count()).toBe(0);
  });
});
