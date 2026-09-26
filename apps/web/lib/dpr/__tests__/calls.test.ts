import { uuidv7 } from "@jim/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type DprBlockLiftRow,
  type DprBlockRow,
  type ExerciseRow,
  type RoutineExerciseRow,
  type SetRow,
  createTestDb,
} from "../../db/schema";
import { completeSet } from "../../sessions/set-actions";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import {
  type DprContext,
  buildDprContext,
  dprBadge,
  dprCallFor,
  dprCallsForRoutine,
  dprChipText,
  dprGoalLine,
  dprRepsPlaceholder,
  dprWeightPlaceholder,
  dprWhyLine,
  needsRpeNudge,
  splitChips,
} from "../calls";
import { loadDprSnapshot } from "../data";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const BENCH = "bench";
const SQUAT = "squat";
const ROW = "row";
const DAY_MS = 24 * 60 * 60 * 1000;

let testDb: ReturnType<typeof createTestDb>;

beforeEach(() => {
  testDb = createTestDb(`jim-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

function exercise(id: string, name: string, equipment: string): ExerciseRow {
  return { id, name, slug: id, equipment, trackingType: "weight_reps" } as ExerciseRow;
}

const EXERCISES = [
  exercise(BENCH, "Bench", "barbell"),
  exercise(SQUAT, "Squat", "barbell"),
  exercise(ROW, "Row", "cable"),
];

/** Logs a completed 3-set session straight into Dexie. */
async function logSession(
  exerciseId: string,
  daysBack: number,
  weight: number,
  reps: number,
  rpe: number | null,
) {
  const sessionId = uuidv7();
  const sessionExerciseId = uuidv7();
  const startedAt = daysAgo(daysBack);
  await testDb.sessions.put({
    id: sessionId,
    userId: USER_ID,
    routineId: null,
    name: null,
    startedAt,
    endedAt: new Date(startedAt.getTime() + 3_600_000),
    notes: null,
    bodyweight: null,
    deviceId: "d",
    updatedAt: startedAt,
    deletedAt: null,
    serverSeq: 0,
  });
  await testDb.sessionExercises.put({
    id: sessionExerciseId,
    userId: USER_ID,
    sessionId,
    exerciseId,
    position: 0,
    supersetGroup: null,
    notes: null,
    updatedAt: startedAt,
    deviceId: "d",
    deletedAt: null,
    serverSeq: 0,
  });
  for (let i = 0; i < 3; i++) {
    await testDb.sets.put({
      id: uuidv7(),
      userId: USER_ID,
      sessionExerciseId,
      setIndex: i,
      kind: "working",
      weight: String(weight),
      reps,
      durationSeconds: null,
      distance: null,
      rpe: rpe === null ? null : String(rpe),
      rir: null,
      completedAt: startedAt,
      supersedesId: null,
      deletedAt: null,
      serverSeq: 0,
    } satisfies SetRow);
  }
}

const block: DprBlockRow = {
  id: "block",
  userId: USER_ID,
  startedAt: daysAgo(20),
  weeks: 8,
  endsAt: new Date(daysAgo(20).getTime() + 56 * DAY_MS),
  status: "active",
  aggressiveness: "moderate",
  experience: "intermediate",
  programId: null,
  createdAt: daysAgo(20),
  updatedAt: daysAgo(20),
  deviceId: "d",
  deletedAt: null,
  serverSeq: 0,
};

function lift(exerciseId: string, position: number, baseline: string | null): DprBlockLiftRow {
  return {
    id: `lift-${exerciseId}`,
    userId: USER_ID,
    blockId: block.id,
    exerciseId,
    position,
    baselineE1rm: baseline,
    goalE1rm: baseline === null ? null : String(Number(baseline) * 1.1),
    updatedAt: daysAgo(20),
    deviceId: "d",
    deletedAt: null,
    serverSeq: 0,
  };
}

async function context(enabled = true): Promise<DprContext | null> {
  const settings = { ...DEFAULT_SETTINGS, dprEnabled: enabled };
  return buildDprContext({
    settings,
    blocks: [block],
    lifts: [lift(BENCH, 0, "220"), lift(ROW, 1, null)],
    exercises: EXERCISES,
    snapshot: await loadDprSnapshot(testDb, { low: 6, high: 8 }),
    now: new Date(),
  });
}

function target(exerciseId: string, position: number): RoutineExerciseRow {
  return {
    exerciseId,
    position,
    targetRepsLow: 6,
    targetRepsHigh: 8,
    targetWeight: null,
    deletedAt: null,
  } as RoutineExerciseRow;
}

describe("in-session DPR (issue #212)", () => {
  it("prefills a focused lift's working sets with DPR's weight and the bottom of the range", async () => {
    await logSession(BENCH, 3, 185, 8, 7);
    const ctx = await context();
    if (!ctx) throw new Error("expected a DPR context");

    const info = dprCallFor(ctx, BENCH, target(BENCH, 0));
    expect(info?.decision.call).toBe("increase");
    expect(dprWeightPlaceholder(info, "working")).toBe("190");
    expect(dprRepsPlaceholder(info, "working")).toBe("6");
    // Warm-up sets keep the usual suggestion.
    expect(dprWeightPlaceholder(info, "warmup")).toBeNull();
  });

  it("logs the DPR weight for a blank field, and the typed weight for an override", async () => {
    await logSession(BENCH, 3, 185, 8, 7);
    const ctx = await context();
    const info = ctx && dprCallFor(ctx, BENCH, target(BENCH, 0));
    const placeholder = Number(dprWeightPlaceholder(info ?? null, "working"));

    for (const [index, typed] of [
      [0, null],
      [1, 195],
    ] as const) {
      await completeSet(
        {
          userId: USER_ID,
          sessionExerciseId: "current",
          exerciseId: BENCH,
          setIndex: index,
          kind: "working",
          weight: typed ?? placeholder,
          reps: 6,
          rpe: 8,
        },
        testDb,
      );
    }
    const logged = (await testDb.sets.where("sessionExerciseId").equals("current").toArray())
      .sort((a, b) => a.setIndex - b.setIndex)
      .map((set) => set.weight);
    expect(logged).toEqual(["190", "195"]);
  });

  it("shows a badge and a why line for each call", async () => {
    await logSession(BENCH, 3, 185, 8, 7);
    const ctx = await context();
    const info = ctx && dprCallFor(ctx, BENCH, target(BENCH, 0));
    if (!info) throw new Error("expected a call");
    expect(dprBadge(info.decision.call).symbol).toBe("↑");
    expect(dprWhyLine(info.decision, "lb")).toBe("DPR: hit 3×8 @ RPE 7 last time → +5 lb");

    expect(dprBadge("hold").symbol).toBe("=");
    expect(dprBadge("deload").symbol).toBe("↓");
    expect(dprBadge("reenter").symbol).toBe("↓");
    expect(dprBadge("insufficient").symbol).toBe("?");
  });

  it("explains a layoff", async () => {
    await logSession(BENCH, 18, 200, 8, 7);
    const ctx = await context();
    const info = ctx && dprCallFor(ctx, BENCH, target(BENCH, 0));
    expect(info && dprWhyLine(info.decision, "lb")).toBe(
      "DPR: 18 days off — easing back in 5% → 190 lb",
    );
  });

  it("nudges for RPE on a focused lift's working sets only", () => {
    expect(needsRpeNudge(true, { kind: "working", rpe: null })).toBe(true);
    expect(needsRpeNudge(true, { kind: "working", rpe: "8.0" })).toBe(false);
    expect(needsRpeNudge(true, { kind: "warmup", rpe: null })).toBe(false);
    expect(needsRpeNudge(false, { kind: "working", rpe: null })).toBe(false);
  });

  it("leaves non-focused lifts alone", async () => {
    await logSession(SQUAT, 3, 315, 8, 7);
    const ctx = await context();
    if (!ctx) throw new Error("expected a DPR context");
    const info = dprCallFor(ctx, SQUAT, target(SQUAT, 0));
    expect(info).toBeNull();
    expect(dprWeightPlaceholder(info, "working")).toBeNull();
    expect(dprRepsPlaceholder(info, "working")).toBeNull();
  });

  it("uses the equipment step: cable rows move in 5 lb steps", async () => {
    await logSession(ROW, 3, 120, 8, 7);
    const ctx = await context();
    const info = ctx && dprCallFor(ctx, ROW, target(ROW, 1));
    expect(info?.increment).toBe(5);
    expect(info?.decision.weight).toBe(125);
  });
});

describe("Workout tab chips (issue #213)", () => {
  it("lists only focused lifts in the routine, in routine order", async () => {
    await logSession(BENCH, 3, 185, 8, 7);
    await logSession(ROW, 3, 120, 6, 9.5);
    const ctx = await context();
    if (!ctx) throw new Error("expected a DPR context");
    const calls = dprCallsForRoutine(ctx, [target(ROW, 2), target(SQUAT, 1), target(BENCH, 0)]);
    expect(calls.map((c) => c.exerciseId)).toEqual([BENCH, ROW]);
    expect(
      calls.map((c) => dprChipText(ctx.exercises.get(c.exerciseId)?.name ?? "", c.decision)),
    ).toEqual(["Bench ↑ 190", "Row = 120"]);
  });

  it("shows '? add RPE' when DPR can't make a call", async () => {
    await logSession(BENCH, 3, 185, 8, null);
    const ctx = await context();
    const info = ctx && dprCallFor(ctx, BENCH, target(BENCH, 0));
    expect(info && dprChipText("OHP", info.decision)).toBe("OHP ? add RPE");
  });

  it("hides everything when DPR is off or no block is running", async () => {
    expect(await context(false)).toBeNull();
    expect(
      buildDprContext({
        settings: { ...DEFAULT_SETTINGS, dprEnabled: true },
        blocks: [{ ...block, status: "completed" }],
        lifts: [],
        exercises: [],
        snapshot: await loadDprSnapshot(testDb, { low: 6, high: 8 }),
        now: new Date(),
      }),
    ).toBeNull();
  });

  it("folds extra chips into '+N more'", () => {
    expect(splitChips([1, 2, 3, 4], 2)).toEqual({ shown: [1, 2], more: 2 });
    expect(splitChips([1, 2], 2)).toEqual({ shown: [1, 2], more: 0 });
  });

  it("describes goal status for the chip popover", async () => {
    await logSession(BENCH, 3, 185, 8, 7);
    const ctx = await context();
    if (!ctx) throw new Error("expected a DPR context");
    const line = dprGoalLine(ctx, BENCH);
    expect(line?.status).not.toBeNull();
    expect(line?.text).toMatch(/^(ahead|on track|behind) · e1RM \d+ → 242 by /);
    expect(dprGoalLine(ctx, ROW)?.text).toMatch(/^Goal set after your first session with RPE/);
    expect(dprGoalLine(ctx, SQUAT)).toBeNull();
  });
});
