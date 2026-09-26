import type { DprDecision } from "@jim/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/schema";
import {
  completeBlock,
  currentBlock,
  endBlockNow,
  lastCompletedBlock,
  planBlock,
  startDeloadWeek,
  startDprBlock,
} from "../block";
import { formatLogEntry } from "../calls";
import { goalChartGeometry } from "../chart";
import { buildDprSnapshot } from "../data";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const day = (n: number) => new Date(Date.UTC(2026, 8, 1 + n));

let testDb: ReturnType<typeof createTestDb>;

beforeEach(() => {
  testDb = createTestDb(`jim-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

const emptySnapshot = buildDprSnapshot(
  { sessions: [], sessionExercises: [], sets: [], routines: [], routineExercises: [] },
  { low: 6, high: 10 },
);

describe("goal chart geometry", () => {
  const block = { startedAt: day(0), endsAt: day(56) };
  const series = [
    { date: day(14), e1rm: 230 },
    { date: day(0), e1rm: 220 },
    { date: day(28), e1rm: 240 },
  ];

  it("plots the series in date order on a shared scale with the goal line", () => {
    const g = goalChartGeometry(series, block, { baselineE1rm: 220, goalE1rm: 250 });
    expect(g.points.map((p) => p.e1rm)).toEqual([220, 230, 240]);
    expect(g.min).toBe(220);
    expect(g.max).toBe(250);
    // Block start at the left edge, end at the right; baseline at the bottom, goal at the top.
    expect(g.goalLine).toEqual({ x1: 10, y1: 110, x2: 310, y2: 10 });
    expect(g.points[0]).toMatchObject({ x: 10, y: 110 });
    // Halfway through the block, two-thirds of the way up.
    expect(g.points[2]).toMatchObject({ x: 160, y: 43.3 });
    expect(g.path).toBe("M10,110 L85,76.7 L160,43.3");
  });

  it("has no goal line before the lift has a baseline", () => {
    const g = goalChartGeometry(series, block, { baselineE1rm: null, goalE1rm: null });
    expect(g.goalLine).toBeNull();
    expect(g.points).toHaveLength(3);
  });

  it("widens the time axis for sessions before the block", () => {
    const g = goalChartGeometry([{ date: day(-28), e1rm: 200 }], block, {
      baselineE1rm: 210,
      goalE1rm: 230,
    });
    expect(g.points[0]?.x).toBe(10);
    expect(g.goalLine?.x1).toBe(110);
  });
});

describe("decision log lines", () => {
  const decision = (overrides: Partial<DprDecision>): DprDecision => ({
    call: "increase",
    weight: 190,
    previousWeight: 185,
    targetReps: 6,
    reason: "Hit 3×8 @ RPE 7.5",
    streak: 1,
    ...overrides,
  });

  it.each([
    [decision({}), /· ↑ 185→190 · 3×8 @ RPE 7\.5$/],
    [
      decision({ call: "hold", weight: 185, reason: "Missed 8/7/5 @ RPE 9 — holding (1/3)" }),
      /· = 185 · Missed/,
    ],
    [
      decision({ call: "deload", weight: 165, reason: "Missed 3 in a row — deload 10%" }),
      /· ↓ 185→165 · Missed 3/,
    ],
    [
      decision({
        call: "insufficient",
        weight: 185,
        previousWeight: 185,
        reason: "Add RPE for DPR",
      }),
      /· \? 185 · Add RPE for DPR$/,
    ],
  ])("%#", (d, pattern) => {
    expect(
      formatLogEntry({ sessionDate: day(11), repRange: { low: 6, high: 8 }, decision: d }),
    ).toMatch(pattern);
  });
});

describe("block lifecycle", () => {
  async function start() {
    const plan = planBlock(emptySnapshot, {
      exerciseIds: ["bench", "squat"],
      weeks: 6,
      preset: "moderate",
      experience: "novice",
      now: new Date(),
      baselineOverrides: new Map([["bench", 250]]),
    });
    const id = await startDprBlock(USER_ID, plan, {}, testDb);
    const block = await testDb.dprBlocks.get(id);
    if (!block) throw new Error("block not written");
    return block;
  }

  it("uses the previous block's final e1RMs as the next block's baselines", async () => {
    await start();
    const lifts = (await testDb.dprBlockLifts.toArray()).sort((a, b) => a.position - b.position);
    expect(lifts[0]).toMatchObject({
      exerciseId: "bench",
      baselineE1rm: "250.00",
      goalE1rm: "281.25",
    });
    expect(lifts[1]).toMatchObject({ exerciseId: "squat", baselineE1rm: null });
  });

  it("runs a deload week, then completes", async () => {
    const block = await start();
    await startDeloadWeek(block, testDb);
    const deload = await testDb.dprBlocks.get(block.id);
    expect(deload?.status).toBe("deload");
    const days = ((deload?.endsAt.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    expect(currentBlock(await testDb.dprBlocks.toArray())?.id).toBe(block.id);

    if (!deload) throw new Error("missing");
    await completeBlock(deload, testDb);
    const blocks = await testDb.dprBlocks.toArray();
    expect(currentBlock(blocks)).toBeNull();
    expect(lastCompletedBlock(blocks)?.id).toBe(block.id);
    expect((await testDb.outbox.toArray()).filter((m) => m.table === "dprBlocks")).toHaveLength(3);
  });

  it("ends a block early by moving its end to now", async () => {
    const block = await start();
    await endBlockNow(block, testDb);
    const ended = await testDb.dprBlocks.get(block.id);
    expect(ended?.status).toBe("active");
    expect(Math.abs((ended?.endsAt.getTime() ?? 0) - Date.now())).toBeLessThan(5_000);
  });
});
