import { describe, expect, it } from "vitest";
import type { DprHistoryEntry, DprSet } from "../decide";
import type { DprBlockInfo } from "../lift-status";
import {
  type MuscleVolumePlan,
  type VolumeExercise,
  mesocycleVolumePlan,
  volumeAdjustedSets,
} from "../volume";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

const exercises = new Map<string, VolumeExercise>([
  ["bench", { primaryMuscles: ["chest"], secondaryMuscles: ["triceps"] }],
  ["fly", { primaryMuscles: ["chest"], secondaryMuscles: [] }],
  ["curl", { primaryMuscles: ["biceps"], secondaryMuscles: [] }],
  ["jacks", { primaryMuscles: ["chest"], secondaryMuscles: [], category: "warmup" }],
]);

const block: DprBlockInfo = { startedAt: day(0), weeks: 4, endsAt: day(28), status: "active" };

function entry(
  exerciseId: string,
  dayIndex: number,
  count: number,
  opts: { reps?: number; rpe?: number | null; warmups?: number } = {},
): DprHistoryEntry {
  const warmups: DprSet[] = Array.from({ length: opts.warmups ?? 0 }, () => ({
    kind: "warmup",
    weight: 50,
    reps: 5,
    rpe: null,
  }));
  const working: DprSet[] = Array.from({ length: count }, () => ({
    kind: "working",
    weight: 100,
    reps: opts.reps ?? 8,
    rpe: opts.rpe === undefined ? 7 : opts.rpe,
  }));
  return {
    exerciseId,
    repRange: { low: 6, high: 10 },
    date: day(dayIndex),
    sets: [...warmups, ...working],
  };
}

function planFor(history: DprHistoryEntry[], now: Date, b = block): Map<string, MuscleVolumePlan> {
  const plans = mesocycleVolumePlan({ history, exercises, block: b, now });
  return new Map(plans.map((plan) => [plan.muscle, plan]));
}

/** Two chest sessions a week (bench 3 + fly 2 each, by default 10 sets), at the given RPE. */
function chestWeek(week: number, rpe = 7, reps = 8, [bench, fly] = [3, 2]): DprHistoryEntry[] {
  return [
    entry("bench", week * 7 + 1, bench, { rpe, reps }),
    entry("fly", week * 7 + 1, fly, { rpe, reps }),
    entry("bench", week * 7 + 4, bench, { rpe, reps }),
    entry("fly", week * 7 + 4, fly, { rpe, reps }),
  ];
}

/** Four weeks following the plan: 10 sets before the block, then 10, 12, 14. */
const growing = [
  ...chestWeek(-1),
  ...chestWeek(0),
  ...chestWeek(1, 7, 8, [3, 3]),
  ...chestWeek(2, 7, 8, [4, 3]),
];

describe("mesocycleVolumePlan", () => {
  it("starts from the week before the block and adds sets week over week", () => {
    const chest = planFor(growing, day(22)).get("chest");
    expect(chest?.start).toBe(10);
    expect(chest?.weeks.map((w) => w.planned)).toEqual([10, 12, 14, 16]);
    expect(chest?.weeks.map((w) => w.call)).toEqual(["start", "add", "add", "add"]);
    expect(chest?.weeks.map((w) => w.actual)).toEqual([10, 12, 14, 0]);
    expect(chest?.current.week).toBe(4);
  });

  it("holds a muscle whose sessions log a high RPE", () => {
    const history = [...chestWeek(-1), ...chestWeek(0, 9), ...chestWeek(1)];
    const chest = planFor(history, day(15)).get("chest");
    expect(chest?.weeks.map((w) => w.planned)).toEqual([10, 10, 12]);
    expect(chest?.weeks.map((w) => w.call)).toEqual(["start", "hold", "add"]);
  });

  it("drops sets after a missed rep target or a near-max RPE", () => {
    const missed = [...chestWeek(-1), ...chestWeek(0), ...chestWeek(1, 8, 4)];
    expect(
      planFor(missed, day(15))
        .get("chest")
        ?.weeks.map((w) => w.planned),
    ).toEqual([10, 12, 10]);

    const grinding = [...chestWeek(-1), ...chestWeek(0, 10)];
    const chest = planFor(grinding, day(8)).get("chest");
    expect(chest?.current).toMatchObject({ planned: 8, call: "drop" });
  });

  it("holds when a week wasn't trained or most of its sets were skipped", () => {
    const skipped = [...chestWeek(-1), entry("bench", 2, 3)];
    expect(planFor(skipped, day(8)).get("chest")?.current).toMatchObject({
      planned: 10,
      call: "hold",
    });
    const off = [...chestWeek(-1)];
    expect(planFor(off, day(8)).get("chest")?.current.call).toBe("hold");
  });

  it("only uses working sets, and leaves warm-up exercises out", () => {
    const history = [
      entry("bench", -5, 3, { warmups: 2 }),
      entry("jacks", -5, 4),
      entry("bench", 2, 3),
    ];
    expect(planFor(history, day(3)).get("chest")?.start).toBe(3);
  });

  it("counts secondary muscles at half a set", () => {
    const history = [entry("bench", -3, 3), entry("bench", -1, 3)];
    expect(planFor(history, day(1)).get("triceps")?.start).toBe(3);
  });

  it("starts a muscle with no earlier history from its first week in the block", () => {
    const history = [entry("curl", 9, 4)];
    const biceps = planFor(history, day(10)).get("biceps");
    expect(biceps?.start).toBe(4);
    expect(biceps?.weeks).toEqual([{ week: 2, planned: 4, actual: 4, call: "start" }]);
    expect(planFor([], day(10)).size).toBe(0);
  });

  it("stops growing at double the start or the top of the hypertrophy range", () => {
    const history = [entry("curl", -2, 3), ...[0, 1, 2].map((w) => entry("curl", w * 7 + 1, 4))];
    const biceps = planFor(history, day(22)).get("biceps");
    expect(biceps?.weeks.map((w) => w.planned)).toEqual([3, 5, 6, 6]);
    expect(biceps?.current.call).toBe("max");
  });

  it("halves the sets in the deload week", () => {
    const deload: DprBlockInfo = { ...block, status: "deload", endsAt: day(35) };
    const chest = planFor(growing, day(30), deload).get("chest");
    expect(chest?.current).toEqual({ week: 5, planned: 8, actual: 0, call: "deload" });
  });
});

describe("volumeAdjustedSets", () => {
  const plans = planFor(growing, day(22));

  it("scales a routine's sets by its muscle's growth", () => {
    // chest is at 16 of a 10-set start.
    expect(volumeAdjustedSets(3, { primaryMuscles: ["chest"], secondaryMuscles: [] }, plans)).toBe(
      5,
    );
    expect(volumeAdjustedSets(2, { primaryMuscles: ["chest"], secondaryMuscles: [] }, plans)).toBe(
      3,
    );
  });

  it("leaves exercises with no planned muscle, and warm-ups, alone", () => {
    expect(
      volumeAdjustedSets(3, { primaryMuscles: ["quads"], secondaryMuscles: [] }, plans),
    ).toBeNull();
    expect(
      volumeAdjustedSets(
        3,
        { primaryMuscles: ["chest"], secondaryMuscles: [], category: "warmup" },
        plans,
      ),
    ).toBeNull();
  });
});
