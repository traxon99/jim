import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mutate } from "../mutate";
import { type RoutineRow, createTestDb } from "../schema";

let testDb: ReturnType<typeof createTestDb>;

beforeEach(() => {
  testDb = createTestDb(`jim-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

function routine(overrides: Partial<RoutineRow> = {}): RoutineRow {
  return {
    id: crypto.randomUUID(),
    userId: "11111111-1111-1111-1111-111111111111",
    name: "Push Day",
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

describe("mutate", () => {
  it("writes the entity and an outbox entry together", async () => {
    const entity = routine();
    await mutate("routines", entity, testDb);

    const storedEntity = await testDb.routines.get(entity.id);
    expect(storedEntity).toEqual(entity);

    const outboxEntries = await testDb.outbox.toArray();
    expect(outboxEntries).toHaveLength(1);
    expect(outboxEntries[0]).toMatchObject({ table: "routines", entity });
  });

  it("gives every mutation its own outbox entry, oldest first by id", async () => {
    const first = routine({ name: "Push Day" });
    const second = routine({ name: "Pull Day" });
    await mutate("routines", first, testDb);
    await mutate("routines", second, testDb);

    const outboxEntries = await testDb.outbox.orderBy("id").toArray();
    expect(outboxEntries).toHaveLength(2);
    expect(outboxEntries[0]?.entity).toMatchObject({ name: "Push Day" });
    expect(outboxEntries[1]?.entity).toMatchObject({ name: "Pull Day" });
  });

  it("never leaves an entity write without its outbox entry", async () => {
    // A mutation always produces exactly one outbox entry, even across
    // several calls for the same entity id (each is a distinct edit).
    const entity = routine();
    await mutate("routines", entity, testDb);
    await mutate("routines", { ...entity, name: "Renamed" }, testDb);

    const storedEntity = await testDb.routines.get(entity.id);
    expect(storedEntity?.name).toBe("Renamed");

    const outboxEntries = await testDb.outbox.toArray();
    expect(outboxEntries).toHaveLength(2);
  });
});
