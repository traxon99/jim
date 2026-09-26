import { suggestNextWorkout, uuidv7 } from "@jim/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mutate } from "../../db/mutate";
import { type ProgramRoutineRow, type ProgramRow, createTestDb } from "../../db/schema";
import { setActiveProgram } from "../set-active";

const USER_ID = "11111111-1111-1111-1111-111111111111";

let testDb: ReturnType<typeof createTestDb>;

beforeEach(() => {
  testDb = createTestDb(`jim-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

function program(overrides: Partial<ProgramRow> = {}): ProgramRow {
  const now = new Date();
  return {
    id: uuidv7(),
    userId: USER_ID,
    name: "PPL",
    mode: "sequence",
    isActive: false,
    notes: null,
    position: 0,
    durationWeeks: null,
    activatedAt: null,
    createdAt: now,
    updatedAt: now,
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
    ...overrides,
  };
}

function entry(programId: string, routineId: string, position: number): ProgramRoutineRow {
  return {
    id: uuidv7(),
    userId: USER_ID,
    programId,
    routineId,
    position,
    weekday: null,
    updatedAt: new Date(),
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
  };
}

describe("programs", () => {
  it("queues program and program-routine writes in the outbox", async () => {
    const ppl = program();
    await mutate("programs", ppl, testDb);
    await mutate("programRoutines", entry(ppl.id, "push", 0), testDb);

    const outbox = await testDb.outbox.toArray();
    expect(outbox.map((m) => m.table)).toEqual(["programs", "programRoutines"]);
    expect(await testDb.programRoutines.where("programId").equals(ppl.id).count()).toBe(1);
  });

  it("keeps at most one program active", async () => {
    const first = program({ isActive: true });
    const second = program({ name: "Upper/Lower" });
    await mutate("programs", first, testDb);
    await mutate("programs", second, testDb);

    await setActiveProgram(second.id, testDb);
    const active = (await testDb.programs.toArray()).filter((p) => p.isActive).map((p) => p.id);
    expect(active).toEqual([second.id]);

    await setActiveProgram(null, testDb);
    expect((await testDb.programs.toArray()).some((p) => p.isActive)).toBe(false);
  });

  it("suggests from rows as stored in Dexie", async () => {
    const ppl = program({ isActive: true });
    await mutate("programs", ppl, testDb);
    for (const [i, routineId] of ["push", "pull", "legs"].entries()) {
      await mutate("programRoutines", entry(ppl.id, routineId, i), testDb);
    }

    const items = await testDb.programRoutines.where("programId").equals(ppl.id).toArray();
    const next = suggestNextWorkout({
      mode: ppl.mode,
      items,
      sessions: [
        { routineId: "push", startedAt: new Date(), endedAt: new Date(), deletedAt: null },
      ],
      now: new Date(),
    });
    expect(next?.routineId).toBe("pull");
  });
});
