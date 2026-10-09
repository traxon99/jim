import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addGym, cleanGymInput, deleteGym, setDefaultGym, sortGyms, updateGym } from "..";
import { type JimDatabase, createTestDb } from "../../db/schema";

const USER_ID = "11111111-1111-1111-1111-111111111111";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-gyms-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

async function liveGyms() {
  return sortGyms(await testDb.gyms.toArray());
}

describe("addGym", () => {
  it("writes the gym and its outbox entry, and makes the first one home", async () => {
    const gym = await addGym(
      { userId: USER_ID, name: "  Iron Temple ", address: " 1 Main St ", notes: "" },
      testDb,
    );
    expect(gym).toMatchObject({
      name: "Iron Temple",
      address: "1 Main St",
      notes: null,
      isDefault: true,
      position: 0,
      deletedAt: null,
    });
    expect(await testDb.gyms.get(gym.id)).toEqual(gym);
    const outbox = await testDb.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ table: "gyms", entity: { id: gym.id } });
  });

  it("adds later gyms after the first, not as home", async () => {
    await addGym({ userId: USER_ID, name: "Home" }, testDb);
    const second = await addGym({ userId: USER_ID, name: "Work" }, testDb);
    expect(second).toMatchObject({ isDefault: false, position: 1 });
  });

  it("rejects a blank name", async () => {
    await expect(addGym({ userId: USER_ID, name: "   " }, testDb)).rejects.toThrow(
      "Give your gym a name",
    );
    expect(cleanGymInput({ name: "" })).toEqual({ ok: false, error: "Give your gym a name" });
  });
});

describe("updateGym", () => {
  it("renames and bumps updatedAt", async () => {
    const gym = await addGym({ userId: USER_ID, name: "Old" }, testDb);
    const updated = await updateGym(gym, { name: "New", address: "2 Side St" }, testDb);
    expect(updated).toMatchObject({ name: "New", address: "2 Side St", isDefault: true });
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(gym.updatedAt.getTime());
  });
});

describe("setDefaultGym", () => {
  it("moves the home flag so only one gym holds it", async () => {
    const first = await addGym({ userId: USER_ID, name: "A" }, testDb);
    const second = await addGym({ userId: USER_ID, name: "B" }, testDb);
    await setDefaultGym(second.id, testDb);
    const gyms = await liveGyms();
    expect(gyms.map((g) => [g.id, g.isDefault])).toEqual([
      [second.id, true],
      [first.id, false],
    ]);
  });
});

describe("deleteGym", () => {
  it("tombstones the gym and hands home to the next one", async () => {
    const first = await addGym({ userId: USER_ID, name: "A" }, testDb);
    const second = await addGym({ userId: USER_ID, name: "B" }, testDb);
    await deleteGym(first, testDb);
    expect((await testDb.gyms.get(first.id))?.deletedAt).toBeInstanceOf(Date);
    const gyms = await liveGyms();
    expect(gyms).toHaveLength(1);
    expect(gyms[0]).toMatchObject({ id: second.id, isDefault: true });
  });

  it("leaves home alone when deleting another gym", async () => {
    const first = await addGym({ userId: USER_ID, name: "A" }, testDb);
    const second = await addGym({ userId: USER_ID, name: "B" }, testDb);
    await deleteGym(second, testDb);
    const gyms = await liveGyms();
    expect(gyms.map((g) => [g.id, g.isDefault])).toEqual([[first.id, true]]);
  });
});
