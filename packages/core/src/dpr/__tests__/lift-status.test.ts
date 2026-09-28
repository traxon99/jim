import { describe, expect, it } from "vitest";
import type { DprSet } from "../decide";
import {
  type DprBlockInfo,
  type DprUserSettings,
  blockEffectiveEnd,
  blockHasEnded,
  blockRecapSummary,
  callForLift,
  currentBlockOf,
  isDeloadWeek,
  liftDecisionLog,
  liftProgress,
  liftRecap,
  liftRepRanges,
  nextBlockBaselines,
} from "../lift-status";
import type { DprSnapshot } from "../snapshot";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));
const settings: DprUserSettings = {
  units: "lb",
  aggressiveness: "moderate",
  increments: {},
  defaultRange: { low: 6, high: 8 },
};

function sets(weight: number, reps: number, rpe: number | null): DprSet[] {
  return [0, 1, 2].map(() => ({ kind: "working", weight, reps, rpe }));
}

function snapshot(
  entries: {
    exerciseId?: string;
    day: number;
    weight: number;
    reps: number;
    rpe: number | null;
    low?: number;
    high?: number;
  }[],
): DprSnapshot {
  return {
    history: entries.map((e) => ({
      exerciseId: e.exerciseId ?? "bench",
      repRange: { low: e.low ?? 6, high: e.high ?? 8 },
      date: day(e.day),
      sets: sets(e.weight, e.reps, e.rpe),
    })),
    routineRanges: [],
    usageRows: [],
    firstSessionAt: null,
    completedSessionCount: entries.length,
  };
}

const block: DprBlockInfo = { startedAt: day(0), weeks: 4, endsAt: day(28), status: "active" };

describe("callForLift", () => {
  it("calls the normal decision outside a deload week", () => {
    const call = callForLift({
      snapshot: snapshot([{ day: 20, weight: 200, reps: 8, rpe: 7 }]),
      exerciseId: "bench",
      equipment: "barbell",
      settings,
      block,
      now: day(22),
    });
    expect(call.decision).toMatchObject({ call: "increase", weight: 205 });
    expect(call.increment).toBe(2.5);
  });

  it("calls every lift at −10% (rounded down) during a deload week", () => {
    const deload: DprBlockInfo = { ...block, status: "deload", endsAt: day(35) };
    expect(isDeloadWeek(deload, day(30))).toBe(true);
    const call = callForLift({
      snapshot: snapshot([{ day: 27, weight: 185, reps: 8, rpe: 7 }]),
      exerciseId: "bench",
      equipment: "barbell",
      settings,
      block: deload,
      now: day(30),
    });
    // 185 × 0.9 = 166.5 → 165
    expect(call.decision).toMatchObject({
      call: "deload",
      weight: 165,
      previousWeight: 185,
      reason: "Deload week",
    });
    expect(isDeloadWeek(deload, day(35))).toBe(false);
  });

  it("adjusts the call for the session's intensity", () => {
    const input = {
      snapshot: snapshot([{ day: 20, weight: 200, reps: 8, rpe: 7 }]),
      exerciseId: "bench",
      equipment: "barbell",
      settings,
      block,
      now: day(22),
    };
    expect(callForLift({ ...input, intensity: "push" }).decision.weight).toBe(205);
    expect(callForLift({ ...input, intensity: "maintain" }).decision).toMatchObject({
      call: "hold",
      weight: 200,
    });
    expect(callForLift({ ...input, intensity: "light" }).decision).toMatchObject({
      call: "light",
      weight: 180,
    });
  });

  it("ignores the intensity during a deload week", () => {
    const deload: DprBlockInfo = { ...block, status: "deload", endsAt: day(35) };
    const call = callForLift({
      snapshot: snapshot([{ day: 27, weight: 185, reps: 8, rpe: 7 }]),
      exerciseId: "bench",
      equipment: "barbell",
      settings,
      block: deload,
      intensity: "light",
      now: day(30),
    });
    expect(call.decision).toMatchObject({ call: "deload", weight: 165 });
  });
});

describe("block end", () => {
  it("ends on schedule without layoffs", () => {
    const snap = snapshot([3, 10, 17, 24].map((d) => ({ day: d, weight: 200, reps: 8, rpe: 7 })));
    expect(blockEffectiveEnd(block, snap, ["bench"], day(20))).toEqual(day(28));
    expect(blockHasEnded(block, snap, ["bench"], day(27))).toBe(false);
    expect(blockHasEnded(block, snap, ["bench"], day(28))).toBe(true);
  });

  it("pushes the end back by a layoff", () => {
    const snap = snapshot([
      { day: 2, weight: 200, reps: 8, rpe: 7 },
      { day: 20, weight: 200, reps: 8, rpe: 7 },
    ]);
    expect(blockEffectiveEnd(block, snap, ["bench"], day(25))).toEqual(day(46));
    expect(blockHasEnded(block, snap, ["bench"], day(30))).toBe(false);
  });

  it("picks the running block, ignoring completed and deleted ones", () => {
    const blocks = [
      { ...block, id: "old", status: "completed" as const, deletedAt: null },
      { ...block, id: "gone", startedAt: day(5), deletedAt: day(6) },
      { ...block, id: "live", startedAt: day(1), deletedAt: null },
    ];
    expect(currentBlockOf(blocks)?.id).toBe("live");
  });
});

describe("recap", () => {
  const snap = snapshot([
    { day: -3, weight: 180, reps: 8, rpe: 8 },
    { day: 5, weight: 190, reps: 8, rpe: 9 },
    { day: 12, weight: 200, reps: 6, rpe: 8 },
    { day: 19, weight: 205, reps: 6, rpe: 9 },
    { day: 26, weight: 205, reps: 5, rpe: 10 },
    { day: 30, weight: 300, reps: 5, rpe: 10 },
    { exerciseId: "squat", day: 10, weight: 300, reps: 5, rpe: 8 },
  ]);

  it("reports baseline → final e1RM, change, goal and best set within the block", () => {
    const recap = liftRecap(snap, "bench", block, { baselineE1rm: 220, goalE1rm: 240 }, day(28));
    // Final = best of the last 3 in-block e1RMs: 200×(6+2), 205×(6+1), 205×5 → 253.33
    expect(recap.finalE1rm).toBeCloseTo(253.33, 2);
    expect(recap.change).toBe(0.152);
    expect(recap.hitGoal).toBe(true);
    // The day-30 set is after the block and doesn't count.
    expect(recap.bestSet).toMatchObject({ weight: 200, reps: 6, rpe: 8 });
  });

  it("summarizes goals hit and the average change", () => {
    const recaps = [
      liftRecap(snap, "bench", block, { baselineE1rm: 220, goalE1rm: 240 }, day(28)),
      liftRecap(snap, "squat", block, { baselineE1rm: 360, goalE1rm: 400 }, day(28)),
      liftRecap(snap, "row", block, { baselineE1rm: null, goalE1rm: null }, day(28)),
    ];
    const summary = blockRecapSummary(recaps);
    expect(summary.goalsHit).toBe(1);
    expect(summary.goalsSet).toBe(2);
    // Squat: 300×(5+2) = 370 vs 360 → +2.8%
    expect(summary.averageChange).toBe(0.09);
  });

  it("carries final e1RMs into the next block's baselines", () => {
    const recaps = [
      liftRecap(snap, "bench", block, { baselineE1rm: 220, goalE1rm: 240 }, day(28)),
      liftRecap(snap, "row", block, { baselineE1rm: 150, goalE1rm: 160 }, day(28)),
    ];
    const baselines = nextBlockBaselines(recaps);
    expect(baselines.get("bench")).toBeCloseTo(253.33, 2);
    // No in-block sessions: keep the old baseline.
    expect(baselines.get("row")).toBe(150);
  });
});

describe("progress and log", () => {
  it("reports the current e1RM and on-track status", () => {
    const snap = snapshot([
      { day: 3, weight: 200, reps: 8, rpe: 8 },
      { day: 10, weight: 205, reps: 8, rpe: 8 },
    ]);
    const progress = liftProgress(
      snap,
      "bench",
      block,
      { baselineE1rm: 250, goalE1rm: 260 },
      day(12),
    );
    expect(progress.currentE1rm).toBeCloseTo(273.33, 2);
    expect(progress.status).toBe("ahead");
    expect(
      liftProgress(snap, "bench", block, { baselineE1rm: null, goalE1rm: null }, day(12)).status,
    ).toBeNull();
  });

  it("merges every rep range's log, newest first", () => {
    const snap = snapshot([
      { day: 1, weight: 225, reps: 5, rpe: 8, low: 4, high: 6 },
      { day: 3, weight: 185, reps: 8, rpe: 7 },
      { day: 5, weight: 230, reps: 6, rpe: 7, low: 4, high: 6 },
    ]);
    const log = liftDecisionLog({
      snapshot: snap,
      exerciseId: "bench",
      equipment: "barbell",
      settings,
      now: day(6),
    });
    expect(log.map((e) => [e.sessionDate, e.repRange.high, e.decision.call])).toEqual([
      [day(5), 6, "increase"],
      [day(3), 8, "increase"],
      [day(1), 6, "hold"],
    ]);
    expect(liftRepRanges(snap, "bench")).toEqual([
      { low: 4, high: 6 },
      { low: 6, high: 8 },
    ]);
  });
});
