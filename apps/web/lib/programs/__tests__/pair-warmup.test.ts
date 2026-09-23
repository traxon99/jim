import { WARMUP_TEMPLATES } from "@jim/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type JimDatabase, type RoutineRow, createTestDb } from "../../db/schema";
import { pairWarmup } from "../pair-warmup";

const USER_ID = "11111111-1111-1111-1111-111111111111";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-pair-warmup-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

function routine(overrides: Partial<RoutineRow> & { id: string }): RoutineRow {
  return {
    userId: USER_ID,
    name: "Leg day",
    notes: null,
    position: 0,
    folder: null,
    kind: "strength",
    warmupRoutineId: null,
    warmupMinutes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
    ...overrides,
  };
}

describe("pairing a warm-up with a program's routine (against Dexie)", () => {
  it("links one of the user's warm-up routines and queues the write", async () => {
    const legs = routine({ id: "legs" });
    await testDb.routines.bulkPut([legs, routine({ id: "warm", kind: "warmup" })]);

    expect(await pairWarmup(USER_ID, legs, "routine:warm", testDb)).toBe("warm");
    expect((await testDb.routines.get("legs"))?.warmupRoutineId).toBe("warm");
    expect((await testDb.outbox.toArray()).map((m) => m.table)).toEqual(["routines"]);
  });

  it("adds a template as a warm-up routine, then links it", async () => {
    const legs = routine({ id: "legs" });
    await testDb.routines.put(legs);
    const template = WARMUP_TEMPLATES[0];

    const warmupId = await pairWarmup(USER_ID, legs, `template:${template.key}`, testDb);

    const warmup = warmupId ? await testDb.routines.get(warmupId) : undefined;
    expect(warmup).toMatchObject({ kind: "warmup", name: template.name });
    expect((await testDb.routines.get("legs"))?.warmupRoutineId).toBe(warmupId);
  });

  it("clears the pairing, and skips the write when nothing changes", async () => {
    const legs = routine({ id: "legs", warmupRoutineId: "warm" });
    await testDb.routines.put(legs);

    expect(await pairWarmup(USER_ID, legs, "routine:warm", testDb)).toBe("warm");
    expect(await testDb.outbox.count()).toBe(0);

    expect(await pairWarmup(USER_ID, legs, "", testDb)).toBeNull();
    expect((await testDb.routines.get("legs"))?.warmupRoutineId).toBeNull();
  });
});
