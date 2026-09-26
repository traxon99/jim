import { uuidv7 } from "@jim/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mutate } from "../../db/mutate";
import {
  type ProgramRow,
  type RoutineExerciseRow,
  type RoutineRow,
  type SessionExerciseRow,
  type SessionRow,
  type SetRow,
  createTestDb,
} from "../../db/schema";
import { setActiveProgram } from "../../programs/set-active";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import {
  currentBlock,
  liveBlockLifts,
  planBlock,
  shouldShowDprPrompt,
  startDprBlock,
  updateBlockFocus,
} from "../block";
import { buildDprSnapshot, e1rmSeries, loadDprSnapshot } from "../data";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE = { low: 6, high: 10 };

let testDb: ReturnType<typeof createTestDb>;

beforeEach(() => {
  testDb = createTestDb(`jim-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

function session(overrides: Partial<SessionRow> = {}): SessionRow {
  const startedAt = overrides.startedAt ?? daysAgo(3);
  return {
    id: uuidv7(),
    userId: USER_ID,
    routineId: null,
    name: null,
    startedAt,
    endedAt: new Date(startedAt.getTime() + 3600_000),
    notes: null,
    bodyweight: null,
    deviceId: "device-a",
    updatedAt: startedAt,
    deletedAt: null,
    serverSeq: 0,
    ...overrides,
  };
}

function sessionExercise(sessionId: string, exerciseId: string): SessionExerciseRow {
  return {
    id: uuidv7(),
    userId: USER_ID,
    sessionId,
    exerciseId,
    position: 0,
    supersetGroup: null,
    notes: null,
    updatedAt: new Date(),
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
  };
}

function set(
  sessionExerciseId: string,
  setIndex: number,
  weight: number,
  reps: number,
  rpe: number | null,
  overrides: Partial<SetRow> = {},
): SetRow {
  return {
    id: uuidv7(),
    userId: USER_ID,
    sessionExerciseId,
    setIndex,
    kind: "working",
    weight: String(weight),
    reps,
    durationSeconds: null,
    distance: null,
    rpe: rpe === null ? null : String(rpe),
    rir: null,
    completedAt: new Date(),
    supersedesId: null,
    deletedAt: null,
    serverSeq: 0,
    ...overrides,
  };
}

function routine(overrides: Partial<RoutineRow> = {}): RoutineRow {
  return {
    id: uuidv7(),
    userId: USER_ID,
    name: "Push",
    notes: null,
    folder: null,
    position: 0,
    kind: "strength",
    warmupRoutineId: null,
    iconShape: null,
    iconColor: null,
    createdAt: daysAgo(100),
    updatedAt: daysAgo(100),
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
    ...overrides,
  } as RoutineRow;
}

function routineExercise(
  routineId: string,
  exerciseId: string,
  low: number | null,
  high: number | null,
): RoutineExerciseRow {
  return {
    id: uuidv7(),
    userId: USER_ID,
    routineId,
    exerciseId,
    position: 0,
    targetSets: 3,
    targetRepsLow: low,
    targetRepsHigh: high,
    targetWeight: null,
    notes: null,
    updatedAt: daysAgo(100),
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
  } as RoutineExerciseRow;
}

/** A completed session of 3 working sets of one exercise. */
function logged(
  exerciseId: string,
  daysBack: number,
  weight: number,
  reps: number,
  rpe: number | null,
  routineId: string | null = null,
) {
  const s = session({ startedAt: daysAgo(daysBack), routineId });
  const se = sessionExercise(s.id, exerciseId);
  const sets = [0, 1, 2].map((i) => set(se.id, i, weight, reps, rpe));
  return { session: s, sessionExercise: se, sets };
}

function rowsOf(
  entries: ReturnType<typeof logged>[],
  extra: Partial<Parameters<typeof buildDprSnapshot>[0]> = {},
) {
  return {
    sessions: entries.map((e) => e.session),
    sessionExercises: entries.map((e) => e.sessionExercise),
    sets: entries.flatMap((e) => e.sets),
    routines: [],
    routineExercises: [],
    ...extra,
  };
}

describe("shouldShowDprPrompt", () => {
  const base = { dprEnabled: false, dprPromptDismissedAt: null };

  it.each([
    [base, 5, false],
    [base, 6, true],
    [base, 40, true],
    [{ ...base, dprEnabled: true }, 10, false],
    [{ ...base, dprPromptDismissedAt: new Date() }, 10, false],
  ])("%o with %s sessions → %s", (settings, count, shown) => {
    expect(shouldShowDprPrompt(settings, count)).toBe(shown);
  });
});

describe("buildDprSnapshot", () => {
  it("tags each session exercise with its routine's rep range", () => {
    const push = routine();
    const heavy = logged("bench", 5, 225, 5, 8, push.id);
    const free = logged("bench", 2, 185, 8, 8);
    const snapshot = buildDprSnapshot(
      rowsOf([heavy, free], {
        routines: [push],
        routineExercises: [routineExercise(push.id, "bench", 4, 6)],
      }),
      RANGE,
    );
    const ranges = snapshot.history
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((h) => h.repRange);
    // The free session has no routine, so it falls back to the most recent
    // routine with bench in it.
    expect(ranges).toEqual([
      { low: 4, high: 6 },
      { low: 4, high: 6 },
    ]);
  });

  it("uses the user's default range with no routine at all", () => {
    const snapshot = buildDprSnapshot(rowsOf([logged("row", 2, 135, 8, 7)]), { low: 8, high: 12 });
    expect(snapshot.history[0]?.repRange).toEqual({ low: 8, high: 12 });
  });

  it("skips in-progress and deleted sessions and superseded or deleted sets", () => {
    const done = logged("bench", 3, 200, 8, 8);
    const inProgress = logged("bench", 0, 205, 8, 8);
    inProgress.session.endedAt = null;
    const deleted = logged("bench", 6, 190, 8, 8);
    deleted.session.deletedAt = new Date();

    const edited = set(done.sessionExercise.id, 0, 210, 8, 8, { supersedesId: done.sets[0]?.id });
    const removed = set(done.sessionExercise.id, 3, 300, 1, 10, { deletedAt: new Date() });
    const base = rowsOf([done, inProgress, deleted]);
    const rows = { ...base, sets: [...base.sets, edited, removed] };

    const snapshot = buildDprSnapshot(rows, RANGE);
    expect(snapshot.completedSessionCount).toBe(1);
    expect(snapshot.history).toHaveLength(1);
    expect(snapshot.history[0]?.sets.map((s) => s.weight)).toEqual([210, 200, 200]);
    expect(snapshot.usageRows).toHaveLength(1);
  });

  it("builds an e1RM series only from sessions with RPE on every working set", () => {
    const snapshot = buildDprSnapshot(
      rowsOf([logged("bench", 9, 200, 5, 10), logged("bench", 5, 200, 5, null)]),
      RANGE,
    );
    const series = e1rmSeries(snapshot.history, "bench");
    expect(series).toHaveLength(1);
    expect(series[0]?.e1rm).toBeCloseTo(233.33, 1);
  });
});

describe("setup wizard → Dexie", () => {
  async function seed(entries: ReturnType<typeof logged>[]) {
    for (const e of entries) {
      await testDb.sessions.put(e.session);
      await testDb.sessionExercises.put(e.sessionExercise);
      await testDb.sets.bulkPut(e.sets);
    }
  }

  it("starts a block with its focused lifts, baselines and goals", async () => {
    await seed([
      logged("bench", 10, 200, 5, 10),
      logged("bench", 7, 205, 5, 10),
      logged("squat", 6, 300, 5, null),
    ]);
    const snapshot = await loadDprSnapshot(testDb, RANGE);
    const now = new Date();
    const plan = planBlock(snapshot, {
      exerciseIds: ["bench", "squat"],
      weeks: 12,
      preset: "moderate",
      experience: "intermediate",
      now,
    });
    const blockId = await startDprBlock(USER_ID, plan, { programId: "prog" }, testDb);

    const blocks = await testDb.dprBlocks.toArray();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      id: blockId,
      weeks: 12,
      status: "active",
      aggressiveness: "moderate",
      experience: "intermediate",
      programId: "prog",
    });
    expect(blocks[0]?.endsAt.getTime()).toBe(now.getTime() + 84 * DAY_MS);
    expect(currentBlock(blocks)?.id).toBe(blockId);

    const lifts = liveBlockLifts(await testDb.dprBlockLifts.toArray(), blockId);
    expect(lifts.map((l) => [l.exerciseId, l.position])).toEqual([
      ["bench", 0],
      ["squat", 1],
    ]);
    // Bench: best of the last 3 = 205 × (1 + 5/30) = 239.17; +10% = 263.09
    expect(lifts[0]?.baselineE1rm).toBe("239.17");
    expect(lifts[0]?.goalE1rm).toBe("263.09");
    // Squat has no RPE-logged session yet.
    expect(lifts[1]?.baselineE1rm).toBeNull();
    expect(lifts[1]?.goalE1rm).toBeNull();

    const outbox = await testDb.outbox.toArray();
    expect(outbox.map((m) => m.table)).toEqual(["dprBlocks", "dprBlockLifts", "dprBlockLifts"]);
  });

  it("caps focus at 5 lifts", () => {
    const plan = planBlock(buildDprSnapshot(rowsOf([]), RANGE), {
      exerciseIds: ["a", "b", "c", "d", "e", "f"],
      weeks: 6,
      preset: "conservative",
      experience: "novice",
      now: new Date(),
    });
    expect(plan.lifts).toHaveLength(5);
  });

  it("adds, removes and reorders lifts mid-block", async () => {
    await seed([logged("row", 4, 135, 8, 8)]);
    const snapshot = await loadDprSnapshot(testDb, RANGE);
    const plan = planBlock(snapshot, {
      exerciseIds: ["bench", "squat"],
      weeks: 8,
      preset: "moderate",
      experience: "novice",
      now: new Date(),
    });
    const blockId = await startDprBlock(USER_ID, plan, {}, testDb);
    const block = await testDb.dprBlocks.get(blockId);
    if (!block) throw new Error("block not written");

    const before = liveBlockLifts(await testDb.dprBlockLifts.toArray(), blockId);
    await updateBlockFocus(block, before, ["row", "bench"], snapshot, testDb);

    const after = liveBlockLifts(await testDb.dprBlockLifts.toArray(), blockId);
    expect(after.map((l) => [l.exerciseId, l.position])).toEqual([
      ["row", 0],
      ["bench", 1],
    ]);
    expect(after[0]?.goalE1rm).not.toBeNull();
    const squat = (await testDb.dprBlockLifts.toArray()).find((l) => l.exerciseId === "squat");
    expect(squat?.deletedAt).not.toBeNull();
  });

  it("ignores completed and deleted blocks", () => {
    const base = {
      userId: USER_ID,
      weeks: 8,
      endsAt: new Date(),
      aggressiveness: "moderate" as const,
      experience: "novice" as const,
      programId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deviceId: "d",
      serverSeq: 0,
    };
    expect(
      currentBlock([
        { ...base, id: "done", startedAt: daysAgo(1), status: "completed", deletedAt: null },
        { ...base, id: "gone", startedAt: daysAgo(2), status: "active", deletedAt: new Date() },
        { ...base, id: "deload", startedAt: daysAgo(60), status: "deload", deletedAt: null },
      ])?.id,
    ).toBe("deload");
  });
});

describe("program duration", () => {
  it("stamps activatedAt when a program becomes active", async () => {
    const now = new Date();
    const program: ProgramRow = {
      id: uuidv7(),
      userId: USER_ID,
      name: "Block",
      mode: "sequence",
      isActive: false,
      notes: null,
      position: 0,
      durationWeeks: 8,
      activatedAt: null,
      createdAt: now,
      updatedAt: now,
      deviceId: "device-a",
      deletedAt: null,
      serverSeq: 0,
    };
    await mutate("programs", program, testDb);
    await setActiveProgram(program.id, testDb);
    const stored = await testDb.programs.get(program.id);
    expect(stored?.activatedAt).toBeInstanceOf(Date);
    expect(stored?.durationWeeks).toBe(8);

    await setActiveProgram(null, testDb);
    expect((await testDb.programs.get(program.id))?.activatedAt).toEqual(stored?.activatedAt);
  });
});

describe("settings defaults", () => {
  it("has DPR off with the 6–10 default range", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      dprEnabled: false,
      dprAggressiveness: "moderate",
      dprDefaultRepLow: 6,
      dprDefaultRepHigh: 10,
      dprPromptDismissedAt: null,
    });
  });
});
