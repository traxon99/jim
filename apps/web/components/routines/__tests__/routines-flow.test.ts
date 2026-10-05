import {
  duplicateRoutine,
  groupRoutinesByFolder,
  reorderRoutineExercises,
  uuidv7,
} from "@jim/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mutate } from "../../../lib/db/mutate";
import { type RoutineExerciseRow, type RoutineRow, createTestDb } from "../../../lib/db/schema";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const DEVICE_A = "device-a";

let testDb: ReturnType<typeof createTestDb>;

beforeEach(() => {
  testDb = createTestDb(`jim-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

function routine(overrides: Partial<RoutineRow> = {}): RoutineRow {
  return {
    id: uuidv7(),
    userId: USER_ID,
    name: "Push day",
    notes: null,
    position: 0,
    folder: null,
    kind: "strength",
    warmupRoutineId: null,
    warmupMinutes: null,
    iconShape: "square",
    iconColor: "blue",
    createdAt: new Date(),
    updatedAt: new Date(),
    deviceId: DEVICE_A,
    deletedAt: null,
    serverSeq: 0,
    ...overrides,
  };
}

function routineExercise(overrides: Partial<RoutineExerciseRow> = {}): RoutineExerciseRow {
  return {
    id: uuidv7(),
    userId: USER_ID,
    routineId: uuidv7(),
    exerciseId: uuidv7(),
    position: 0,
    supersetGroup: null,
    targetSets: 5,
    targetRepsLow: 5,
    targetRepsHigh: 5,
    targetRestSeconds: 120,
    targetDurationSeconds: null,
    targetWeight: null,
    progressionRule: null,
    notes: null,
    updatedAt: new Date(),
    deviceId: DEVICE_A,
    deletedAt: null,
    serverSeq: 0,
    ...overrides,
  };
}

/** Mirrors routines-list.tsx's read pipeline: live query -> filter tombstones -> group. */
function runListPipeline(rows: RoutineRow[]) {
  return groupRoutinesByFolder(rows.filter((r) => !r.deletedAt));
}

describe("routines list read pipeline (against Dexie)", () => {
  it("a routine built fully offline is immediately visible in the local pipeline, with no network", async () => {
    const r = routine({ name: "Leg day", folder: "PPL" });
    await mutate("routines", r, testDb);

    const rows = await testDb.routines.toArray();
    const groups = runListPipeline(rows);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.folder).toBe("PPL");
    expect(groups[0]?.routines[0]?.name).toBe("Leg day");

    const outbox = await testDb.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ table: "routines", entity: { id: r.id } });
  });

  it("groups ungrouped and foldered routines separately", async () => {
    await mutate("routines", routine({ id: "a", folder: null }), testDb);
    await mutate("routines", routine({ id: "b", folder: "5/3/1" }), testDb);

    const rows = await testDb.routines.toArray();
    const groups = runListPipeline(rows);

    expect(groups.map((g) => g.folder)).toEqual([null, "5/3/1"]);
  });
});

describe("duplicating a routine (against Dexie)", () => {
  it("persists a fully separate routine and items, without aliasing the original", async () => {
    const original = routine({ name: "Push day" });
    const items = [
      routineExercise({ routineId: original.id, exerciseId: "bench", targetSets: 5 }),
      routineExercise({ routineId: original.id, exerciseId: "ohp", targetSets: 3 }),
    ];
    await mutate("routines", original, testDb);
    for (const item of items) await mutate("routineExercises", item, testDb);

    const { routine: duplicated, items: duplicatedItems } = duplicateRoutine(
      original,
      items,
      USER_ID,
      uuidv7,
    );
    await mutate("routines", { ...duplicated, updatedAt: new Date(), deviceId: DEVICE_A }, testDb);
    for (const item of duplicatedItems) {
      await mutate(
        "routineExercises",
        { ...item, updatedAt: new Date(), deviceId: DEVICE_A },
        testDb,
      );
    }

    const allRoutines = await testDb.routines.toArray();
    expect(allRoutines).toHaveLength(2);
    expect(allRoutines.map((r) => r.id).sort()).toEqual([original.id, duplicated.id].sort());

    const allItems = await testDb.routineExercises.toArray();
    expect(allItems).toHaveLength(4);

    // Editing the duplicate's items must never touch the original's rows.
    const firstOriginalItem = items[0];
    expect(firstOriginalItem).toBeDefined();
    const originalItemAfter = await testDb.routineExercises.get(firstOriginalItem?.id ?? "");
    expect(originalItemAfter?.targetSets).toBe(5);

    const duplicatedRoutineItems = allItems.filter((i) => i.routineId === duplicated.id);
    expect(duplicatedRoutineItems).toHaveLength(2);
    expect(duplicatedRoutineItems.every((i) => i.routineId !== original.id)).toBe(true);
  });
});

describe("reordering routine exercises (against Dexie)", () => {
  it("persists the new position, readable after a simulated restart (a fresh Dexie read)", async () => {
    const routineId = uuidv7();
    const items = [
      routineExercise({ id: "i1", routineId, exerciseId: "bench", position: 0 }),
      routineExercise({ id: "i2", routineId, exerciseId: "ohp", position: 1 }),
      routineExercise({ id: "i3", routineId, exerciseId: "row", position: 2 }),
    ];
    for (const item of items) await mutate("routineExercises", item, testDb);

    const reordered = reorderRoutineExercises(items, "i3", "i1");
    for (const reorderedItem of reordered) {
      const original = items.find((i) => i.id === reorderedItem.id);
      if (!original || original.position === reorderedItem.position) continue;
      await mutate(
        "routineExercises",
        {
          ...original,
          position: reorderedItem.position,
          updatedAt: new Date(),
          deviceId: DEVICE_A,
        },
        testDb,
      );
    }

    // Simulate an app restart: read straight from Dexie, not from in-memory state.
    const persisted = await testDb.routineExercises.where("routineId").equals(routineId).toArray();
    const order = persisted.sort((a, b) => a.position - b.position).map((i) => i.id);

    expect(order).toEqual(["i3", "i1", "i2"]);
  });
});

describe("deleting a routine (against Dexie)", () => {
  it("soft-deletes via a tombstone, leaving the row (and its exercises) intact rather than removed", async () => {
    const r = routine();
    const item = routineExercise({ routineId: r.id });
    await mutate("routines", r, testDb);
    await mutate("routineExercises", item, testDb);

    await mutate(
      "routines",
      { ...r, deletedAt: new Date(), updatedAt: new Date(), deviceId: DEVICE_A },
      testDb,
    );

    const stillThere = await testDb.routines.get(r.id);
    expect(stillThere).toBeDefined();
    expect(stillThere?.deletedAt).not.toBeNull();

    // A soft-deleted routine no longer shows up in the list pipeline...
    const rows = await testDb.routines.toArray();
    expect(runListPipeline(rows)).toHaveLength(0);

    // ...but its routine_exercises rows, and by extension any session that
    // referenced this routine, are never touched by the delete.
    const itemStillThere = await testDb.routineExercises.get(item.id);
    expect(itemStillThere).toBeDefined();
    expect(itemStillThere?.deletedAt).toBeNull();
  });
});
