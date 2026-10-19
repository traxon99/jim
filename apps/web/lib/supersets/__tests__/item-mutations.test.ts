import "fake-indexeddb/auto";
import { JimDatabase, type RoutineExerciseRow } from "@/lib/db/schema";
import { uuidv7 } from "@jim/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addExerciseItems,
  applySupersetChanges,
  formSupersetIn,
  reorderItemsIn,
} from "../item-mutations";

function routineItem(position: number, supersetGroup: number | null = null): RoutineExerciseRow {
  return {
    id: uuidv7(),
    userId: "u",
    routineId: "r",
    exerciseId: `e${position}`,
    position,
    supersetGroup,
    targetSets: null,
    targetRepsLow: null,
    targetRepsHigh: null,
    targetRestSeconds: null,
    targetDurationSeconds: null,
    targetWeight: null,
    progressionRule: null,
    notes: null,
    updatedAt: new Date(0),
    deviceId: "d",
    deletedAt: null,
    serverSeq: 0,
  };
}

describe("exercise item mutations (#550)", () => {
  let database: JimDatabase;

  beforeEach(async () => {
    database = new JimDatabase(`item-mutations-${uuidv7()}`);
    await database.open();
  });

  afterEach(async () => {
    database.close();
  });

  it("adds several picks after the existing items as one superset", async () => {
    const existing = [routineItem(0)];
    await addExerciseItems(
      "routineExercises",
      existing,
      existing.length,
      ["a", "b"],
      ({ exerciseId, position, supersetGroup, now, deviceId }) => ({
        ...routineItem(position, supersetGroup),
        exerciseId,
        updatedAt: now,
        deviceId,
      }),
      database,
    );
    const added = (await database.routineExercises.toArray()).sort(
      (a, b) => a.position - b.position,
    );
    expect(added.map((item) => [item.exerciseId, item.position])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect(added[0]?.supersetGroup).not.toBeNull();
    expect(added[0]?.supersetGroup).toBe(added[1]?.supersetGroup);
    expect(await database.outbox.count()).toBe(2);
  });

  it("writes superset changes and groups picked items together", async () => {
    const items = [routineItem(0), routineItem(1), routineItem(2)];
    await database.routineExercises.bulkPut(items);
    await applySupersetChanges(
      "routineExercises",
      items,
      [{ id: items[0]?.id as string, supersetGroup: 7 }],
      database,
    );
    expect((await database.routineExercises.get(items[0]?.id as string))?.supersetGroup).toBe(7);

    await formSupersetIn(
      "routineExercises",
      items,
      [items[0]?.id as string, items[2]?.id as string],
      [],
      database,
    );
    const after = (await database.routineExercises.toArray()).sort(
      (a, b) => a.position - b.position,
    );
    const grouped = after.filter((item) => item.supersetGroup != null);
    expect(grouped.map((item) => item.id)).toEqual([items[0]?.id, items[2]?.id]);
  });

  it("saves a new order in the items' own positions and writes only what moved (#658)", async () => {
    const items = [routineItem(2), routineItem(3), routineItem(4)];
    await database.routineExercises.bulkPut(items);
    const [a, b, c] = items.map((item) => item.id);
    await reorderItemsIn("routineExercises", items, [a, c, b] as string[], database);
    const after = (await database.routineExercises.toArray()).sort(
      (x, y) => x.position - y.position,
    );
    expect(after.map((item) => [item.id, item.position])).toEqual([
      [a, 2],
      [c, 3],
      [b, 4],
    ]);
    expect(await database.outbox.count()).toBe(2);
  });

  it("splits a superset a move pulls apart (#658)", async () => {
    const items = [routineItem(0, 1), routineItem(1, 1), routineItem(2)];
    await database.routineExercises.bulkPut(items);
    const [a, b, c] = items.map((item) => item.id);
    await reorderItemsIn("routineExercises", items, [a, c, b] as string[], database);
    const after = await database.routineExercises.toArray();
    expect(after.every((item) => item.supersetGroup == null)).toBe(true);
  });
});
