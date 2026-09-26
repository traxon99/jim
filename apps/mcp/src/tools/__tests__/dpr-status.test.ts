import {
  type DprSourceRows,
  buildDprSnapshot,
  callForLift,
  liftDecisionLog,
  liftProgress,
} from "@jim/core";
import { describe, expect, it } from "vitest";
import { type DprStatusInput, dprStatusFromRows } from "../dpr-status.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-26T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY_MS);

function rows(): DprSourceRows {
  const sessions: DprSourceRows["sessions"][number][] = [];
  const sessionExercises: DprSourceRows["sessionExercises"][number][] = [];
  const sets: DprSourceRows["sets"][number][] = [];
  const log = (
    id: string,
    exerciseId: string,
    back: number,
    weight: number,
    reps: number,
    rpe: number | null,
    routineId: string | null,
  ) => {
    sessions.push({
      id,
      routineId,
      startedAt: daysAgo(back),
      endedAt: daysAgo(back),
      deletedAt: null,
    });
    sessionExercises.push({ id: `${id}-se`, sessionId: id, exerciseId, deletedAt: null });
    for (let i = 0; i < 3; i++) {
      sets.push({
        id: `${id}-${i}`,
        sessionExerciseId: `${id}-se`,
        setIndex: i,
        kind: "working",
        weight: String(weight),
        reps,
        rpe: rpe === null ? null : String(rpe),
        supersedesId: null,
        deletedAt: null,
      });
    }
  };
  log("s1", "bench", 30, 185, 8, 8, "push");
  log("s2", "bench", 23, 190, 8, 7.5, "push");
  log("s3", "bench", 16, 195, 7, 8, "push");
  log("s4", "bench", 9, 195, 8, 8, "push");
  log("s5", "bench", 2, 200, 6, 9.5, "push");
  log("s6", "squat", 5, 275, 5, null, null);
  // A deleted workout never counts.
  log("s7", "bench", 1, 400, 10, 6, "push");
  sessions[sessions.length - 1] = {
    ...(sessions.at(-1) as DprSourceRows["sessions"][number]),
    deletedAt: now,
  };

  return {
    sessions,
    sessionExercises,
    sets,
    routines: [{ id: "push", updatedAt: daysAgo(60), deletedAt: null }],
    routineExercises: [
      {
        routineId: "push",
        exerciseId: "bench",
        targetRepsLow: 6,
        targetRepsHigh: 8,
        updatedAt: daysAgo(60),
        deletedAt: null,
      },
    ],
  };
}

const input: DprStatusInput = {
  user: {
    units: "lb",
    dprEnabled: true,
    dprAggressiveness: "moderate",
    dprExperience: "intermediate",
    dprEquipmentIncrements: {},
    dprDefaultRepLow: 6,
    dprDefaultRepHigh: 10,
  },
  blocks: [
    {
      id: "old",
      startedAt: daysAgo(120),
      weeks: 8,
      endsAt: daysAgo(64),
      status: "completed",
      aggressiveness: "moderate",
      experience: "novice",
      deletedAt: null,
    },
    {
      id: "block",
      startedAt: daysAgo(21),
      weeks: 8,
      endsAt: new Date(daysAgo(21).getTime() + 56 * DAY_MS),
      status: "active",
      aggressiveness: "moderate",
      experience: "intermediate",
      deletedAt: null,
    },
  ],
  lifts: [
    {
      blockId: "block",
      exerciseId: "squat",
      position: 1,
      baselineE1rm: null,
      goalE1rm: null,
      deletedAt: null,
    },
    {
      blockId: "block",
      exerciseId: "bench",
      position: 0,
      baselineE1rm: "240.00",
      goalE1rm: "260.00",
      deletedAt: null,
    },
    {
      blockId: "old",
      exerciseId: "row",
      position: 0,
      baselineE1rm: "150.00",
      goalE1rm: "160.00",
      deletedAt: null,
    },
  ],
  exercises: [
    { id: "bench", name: "Bench Press", equipment: "barbell" },
    { id: "squat", name: "Squat", equipment: "barbell" },
  ],
  rows: rows(),
  now,
};

describe("dpr_status", () => {
  const status = dprStatusFromRows(input);

  it("reports the settings and the running block", () => {
    expect(status).toMatchObject({ enabled: true, preset: "moderate", experience: "intermediate" });
    expect(status.block).toMatchObject({ weeks: 8, status: "active", ended: false });
    expect(status.lifts.map((l) => l.exercise.name)).toEqual(["Bench Press", "Squat"]);
  });

  it("matches the core functions the web app uses", () => {
    const snapshot = buildDprSnapshot(input.rows, { low: 6, high: 10 });
    const settings = {
      units: "lb" as const,
      aggressiveness: "moderate" as const,
      increments: {},
      defaultRange: { low: 6, high: 10 },
    };
    const block = input.blocks[1];
    if (!block) throw new Error("fixture");
    const call = callForLift({
      snapshot,
      exerciseId: "bench",
      equipment: "barbell",
      settings,
      block,
      now,
    });
    const progress = liftProgress(
      snapshot,
      "bench",
      block,
      { baselineE1rm: 240, goalE1rm: 260 },
      now,
    );
    const log = liftDecisionLog({
      snapshot,
      exerciseId: "bench",
      equipment: "barbell",
      settings,
      now,
    });

    const bench = status.lifts[0];
    expect(bench?.nextCall).toEqual({
      call: call.decision.call,
      weight: call.decision.weight,
      reason: call.decision.reason,
      repRange: call.repRange,
    });
    expect(bench?.e1rm.current).toBeCloseTo(progress.currentE1rm ?? 0, 2);
    expect(bench?.status).toBe(progress.status);
    expect(bench?.recentDecisions).toHaveLength(5);
    expect(bench?.recentDecisions.map((d) => d.call)).toEqual(
      log.slice(0, 5).map((e) => e.decision.call),
    );
  });

  it("makes the expected calls from the fixture history", () => {
    const [bench, squat] = status.lifts;
    // Last bench session: 200×6 @ 9.5 — a miss, so hold.
    expect(bench?.nextCall).toMatchObject({
      call: "hold",
      weight: 200,
      repRange: { low: 6, high: 8 },
    });
    expect(bench?.repRanges).toEqual([{ low: 6, high: 8 }]);
    expect(bench?.e1rm).toMatchObject({ baseline: 240, goal: 260 });
    // Squat has no RPE yet.
    expect(squat?.nextCall).toMatchObject({ call: "insufficient", reason: "Add RPE for DPR" });
    expect(squat?.e1rm).toEqual({ baseline: null, current: null, goal: null });
    expect(squat?.status).toBeNull();
  });

  it("reports no block when none is running", () => {
    const none = dprStatusFromRows({
      ...input,
      blocks: [input.blocks[0] as DprStatusInput["blocks"][number]],
    });
    expect(none.block).toBeNull();
    expect(none.lifts).toEqual([]);
  });
});
