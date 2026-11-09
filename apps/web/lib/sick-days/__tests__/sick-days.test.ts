import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { markSickDay, unmarkSickDay } from "..";
import { type JimDatabase, createTestDb } from "../../db/schema";

const USER_ID = "11111111-1111-1111-1111-111111111111";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-sick-days-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

describe("markSickDay", () => {
  it("writes the day through the outbox", async () => {
    const row = await markSickDay(
      { userId: USER_ID, day: "2026-11-08", today: "2026-11-09", note: "  flu " },
      testDb,
    );
    expect(row).toMatchObject({ day: "2026-11-08", note: "flu", deletedAt: null });
    const outbox = await testDb.outbox.toArray();
    expect(outbox.map((entry) => entry.table)).toEqual(["sickDays"]);
  });

  it("reuses the live row when the day is marked again", async () => {
    const first = await markSickDay(
      { userId: USER_ID, day: "2026-11-09", today: "2026-11-09" },
      testDb,
    );
    const again = await markSickDay(
      { userId: USER_ID, day: "2026-11-09", today: "2026-11-09" },
      testDb,
    );
    expect(again.id).toBe(first.id);
    const noted = await markSickDay(
      { userId: USER_ID, day: "2026-11-09", today: "2026-11-09", note: "cold" },
      testDb,
    );
    expect(noted).toMatchObject({ id: first.id, note: "cold" });
    expect(await testDb.sickDays.count()).toBe(1);
  });

  it("refuses a future or invalid day", async () => {
    await expect(
      markSickDay({ userId: USER_ID, day: "2026-11-10", today: "2026-11-09" }, testDb),
    ).rejects.toThrow("future");
    await expect(
      markSickDay({ userId: USER_ID, day: "2026-11-31", today: "2026-11-09" }, testDb),
    ).rejects.toThrow("Pick a day");
  });
});

describe("unmarkSickDay", () => {
  it("tombstones every live row for the day", async () => {
    const row = await markSickDay(
      { userId: USER_ID, day: "2026-11-09", today: "2026-11-09" },
      testDb,
    );
    // A second device's row for the same day, synced in.
    await testDb.sickDays.put({ ...row, id: "0193aaaa-0000-7000-8000-000000000001" });
    await unmarkSickDay("2026-11-09", testDb);
    const rows = await testDb.sickDays.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.deletedAt !== null)).toBe(true);
  });
});
