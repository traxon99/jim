import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type GymRow, type JimDatabase, createTestDb } from "../../db/schema";
import { setDefaultGym } from "../../gyms";
import { saveSetupGym } from "../save-gym";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const INPUT = { userId: USER_ID, name: "Iron Temple", address: "", notes: "" };

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-save-gym-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

describe("saveSetupGym", () => {
  it("a retry after making it home fails only repeats that step", async () => {
    await saveSetupGym({ ...INPUT, name: "Existing" }, { current: null }, testDb);
    const created: { current: GymRow | null } = { current: null };
    const failing = async () => {
      throw new Error("offline");
    };
    await expect(saveSetupGym(INPUT, created, testDb, failing)).rejects.toThrow("offline");
    expect(await testDb.gyms.count()).toBe(2);

    await saveSetupGym(INPUT, created, testDb, setDefaultGym);
    const gyms = await testDb.gyms.toArray();
    expect(gyms).toHaveLength(2);
    const added = gyms.filter((g) => g.name === "Iron Temple");
    expect(added).toHaveLength(1);
    expect(added[0]?.isDefault).toBe(true);
    expect(created.current).toBeNull();
  });
});
