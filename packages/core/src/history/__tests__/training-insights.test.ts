import { describe, expect, it } from "vitest";
import { estimateOneRepMax } from "../../one-rep-max";
import {
  type InsightSet,
  plainOneRepMax,
  progressDecomposition,
  rapidSetFlags,
  repeatedTargetTrends,
  rpeAdjustedOneRepMax,
  workoutGaps,
} from "../training-insights";
import { localTimeOfDay, startOfLocalDay } from "../week-grouping";

let nextId = 0;
function set(day: string, session: string, fields: Partial<InsightSet>): InsightSet {
  nextId += 1;
  return {
    id: `set-${nextId}`,
    sessionId: session,
    exerciseId: "rdl",
    completedAt: new Date(`${day}T18:00:${String(nextId % 60).padStart(2, "0")}Z`),
    localDate: day,
    kind: "working",
    weight: 100,
    reps: 8,
    rpe: null,
    ...fields,
  };
}

describe("training insights (#860)", () => {
  it("matches the app's plain e1RM and adds reps in reserve for the adjusted one", () => {
    expect(plainOneRepMax(100, 8)).toBe(estimateOneRepMax(100, 8));
    expect(plainOneRepMax(0, 8)).toBeNull();
    expect(rpeAdjustedOneRepMax(100, 8, null)).toBeNull();
    // RPE 8 → 2 in reserve → 10 reps.
    expect(rpeAdjustedOneRepMax(100, 8, 8)).toBe(estimateOneRepMax(100, 10));
    // Effective reps cap at 20, past the plain cap of 15.
    expect(rpeAdjustedOneRepMax(100, 15, 4)).toBeCloseTo(100 * (1 + 20 / 30), 2);
    // RPE above 10 never gives negative reserve.
    expect(rpeAdjustedOneRepMax(100, 1, 10)).toBe(100);
  });

  it("splits a change into weight, reps and effort that add up", () => {
    const [result] = progressDecomposition([
      set("2026-11-01", "a", { weight: 100, reps: 8, rpe: 9 }),
      set("2026-11-08", "b", { weight: 110, reps: 10, rpe: 7 }),
    ]);
    if (result?.status !== "ok") throw new Error("expected ok");
    expect(result.basis).toBe("rpe_adjusted");
    const { weight, reps, effort } = result.parts;
    expect(weight + reps + (effort ?? 0)).toBeCloseTo(result.change, 1);
    expect(weight).toBeGreaterThan(0);
    expect(reps).toBeGreaterThan(0);
    expect(effort).toBeGreaterThan(0);
  });

  it("falls back to the plain e1RM, with no effort part, when an end has no RPE", () => {
    const [result] = progressDecomposition([
      set("2026-11-01", "a", { weight: 100, reps: 5 }),
      set("2026-11-08", "b", { weight: 105, reps: 5, rpe: 8 }),
    ]);
    expect(result).toMatchObject({ status: "ok", basis: "plain", dominant: "weight" });
    if (result?.status === "ok") expect(result.parts.effort).toBeNull();
  });

  it("drops one-session targets and keeps the session's RPE count", () => {
    const targets = repeatedTargetTrends([
      set("2026-11-01", "a", { rpe: 9 }),
      set("2026-11-01", "a", { rpe: null }),
      set("2026-11-08", "b", { rpe: 8 }),
      set("2026-11-08", "b", { weight: 120 }),
      set("2026-11-08", "b", { kind: "warmup", weight: 50 }),
      set("2026-11-15", "c", { kind: "warmup", weight: 50 }),
    ]);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ weight: 100, rpeChange: -1 });
    expect(targets[0]?.sessions[0]).toMatchObject({ setCount: 2, rpeSetCount: 1, rpes: [9, null] });
    expect(
      repeatedTargetTrends(
        [
          set("2026-11-08", "b", { kind: "warmup", weight: 50 }),
          set("2026-11-15", "c", { kind: "warmup", weight: 50 }),
        ],
        { includeWarmups: true },
      ),
    ).toHaveLength(1);
  });

  it("finds layoffs with their sick days, and sets logged seconds apart", () => {
    expect(workoutGaps(["2026-11-01", "2026-11-03", "2026-11-10"], 4, ["2026-11-05"])).toEqual([
      { from: "2026-11-03", to: "2026-11-10", days: 7, sickDays: 1 },
    ]);
    const a = set("2026-11-01", "s", { completedAt: new Date("2026-11-01T18:00:00Z") });
    const b = set("2026-11-01", "s", { completedAt: new Date("2026-11-01T18:00:04Z") });
    const c = set("2026-11-01", "s", { completedAt: new Date("2026-11-01T18:03:00Z") });
    expect(rapidSetFlags([c, b, a], 10)).toEqual([
      expect.objectContaining({ setIds: [a.id, b.id], secondsApart: 4 }),
    ]);
  });

  it("turns a local day into its UTC start, across a DST change", () => {
    expect(startOfLocalDay("2026-11-02", "America/Los_Angeles").toISOString()).toBe(
      "2026-11-02T08:00:00.000Z",
    );
    expect(startOfLocalDay("2026-10-31", "America/Los_Angeles").toISOString()).toBe(
      "2026-10-31T07:00:00.000Z",
    );
    expect(localTimeOfDay(new Date("2026-11-19T07:01:00Z"), "America/Los_Angeles")).toBe("23:01");
  });
});
