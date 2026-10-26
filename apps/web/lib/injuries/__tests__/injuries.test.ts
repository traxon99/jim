import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  INJURY_NOTE_MAX,
  deleteInjury,
  injuryHistoryByArea,
  logPain,
  markHealed,
  reportInjury,
  sortOpenInjuries,
} from "..";
import { type JimDatabase, createTestDb } from "../../db/schema";

const USER_ID = "11111111-1111-1111-1111-111111111111";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-injuries-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

describe("reportInjury", () => {
  it("writes the injury and today's pain through the outbox", async () => {
    const injury = await reportInjury(
      {
        userId: USER_ID,
        area: "knee",
        side: "left",
        startedOn: "2026-10-20",
        painLevel: 4,
        note: "  tweaked on squats ",
        today: "2026-10-21",
      },
      testDb,
    );
    expect(injury).toMatchObject({
      area: "knee",
      side: "left",
      startedOn: "2026-10-20",
      healedOn: null,
      note: "tweaked on squats",
    });
    const checkins = await testDb.painCheckins.toArray();
    expect(checkins).toEqual([
      expect.objectContaining({ injuryId: injury.id, day: "2026-10-21", painLevel: 4 }),
    ]);
    const outbox = await testDb.outbox.toArray();
    expect(outbox.map((entry) => entry.table)).toEqual(["injuries", "painCheckins"]);
  });

  it("drops the side for an area on the center line and caps the note", async () => {
    const injury = await reportInjury(
      {
        userId: USER_ID,
        area: "lower back",
        side: "left",
        startedOn: "2026-10-20",
        painLevel: 2,
        note: "x".repeat(INJURY_NOTE_MAX + 50),
        today: "2026-10-20",
      },
      testDb,
    );
    expect(injury.side).toBeNull();
    expect(injury.note).toHaveLength(INJURY_NOTE_MAX);
  });

  it("asks for a side on a paired area, a real area and a start no later than today", async () => {
    const base = {
      userId: USER_ID,
      area: "knee",
      side: null,
      startedOn: "2026-10-20",
      painLevel: 3,
      today: "2026-10-20",
    };
    await expect(reportInjury(base, testDb)).rejects.toThrow("Pick a side");
    await expect(reportInjury({ ...base, area: "toe", side: "left" }, testDb)).rejects.toThrow(
      "Pick where it hurts",
    );
    await expect(
      reportInjury({ ...base, side: "left", startedOn: "2026-10-21" }, testDb),
    ).rejects.toThrow("can't start in the future");
    await expect(reportInjury({ ...base, side: "left", painLevel: 11 }, testDb)).rejects.toThrow(
      "0 to 10",
    );
    expect(await testDb.injuries.count()).toBe(0);
  });
});

describe("logPain", () => {
  it("updates the same day's check-in instead of adding a second", async () => {
    const injury = await reportInjury(
      {
        userId: USER_ID,
        area: "wrist",
        side: "right",
        startedOn: "2026-10-20",
        painLevel: 5,
        today: "2026-10-20",
      },
      testDb,
    );
    await logPain(injury, 3, "2026-10-20", testDb);
    await logPain(injury, 1, "2026-10-21", testDb);
    const checkins = (await testDb.painCheckins.toArray()).sort((a, b) =>
      a.day.localeCompare(b.day),
    );
    expect(checkins.map((row) => [row.day, row.painLevel])).toEqual([
      ["2026-10-20", 3],
      ["2026-10-21", 1],
    ]);
  });
});

describe("healing and history", () => {
  it("marks an injury healed and groups history by area, newest first", async () => {
    const report = (area: string, startedOn: string) =>
      reportInjury(
        { userId: USER_ID, area, side: "left", startedOn, painLevel: 2, today: "2026-10-25" },
        testDb,
      );
    const first = await report("knee", "2026-09-01");
    await markHealed(first, "2026-09-10", testDb);
    const flareUp = await report("knee", "2026-10-01");
    const elbow = await report("elbow", "2026-10-05");
    await markHealed(elbow, "2026-10-12", testDb);

    const rows = await testDb.injuries.toArray();
    expect(sortOpenInjuries(rows).map((row) => row.id)).toEqual([flareUp.id]);
    const history = injuryHistoryByArea(rows);
    expect(history.map((group) => group.label)).toEqual(["Left elbow", "Left knee"]);
    expect(history[1]?.injuries.map((row) => row.id)).toEqual([first.id]);
  });

  it("can't heal before the injury started", async () => {
    const injury = await reportInjury(
      {
        userId: USER_ID,
        area: "neck",
        side: null,
        startedOn: "2026-10-20",
        painLevel: 2,
        today: "2026-10-20",
      },
      testDb,
    );
    await expect(markHealed(injury, "2026-10-19", testDb)).rejects.toThrow();
  });

  it("deletes an injury with its check-ins", async () => {
    const injury = await reportInjury(
      {
        userId: USER_ID,
        area: "chest",
        side: "both",
        startedOn: "2026-10-20",
        painLevel: 2,
        today: "2026-10-20",
      },
      testDb,
    );
    await deleteInjury(injury, testDb);
    expect((await testDb.injuries.get(injury.id))?.deletedAt).toBeInstanceOf(Date);
    const checkins = await testDb.painCheckins.toArray();
    expect(checkins.every((row) => row.deletedAt instanceof Date)).toBe(true);
  });
});
