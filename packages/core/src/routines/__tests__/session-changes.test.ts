import { describe, expect, it } from "vitest";
import {
  type RoutineChangeRoutineItem,
  type RoutineChangeSessionItem,
  diffSessionAgainstRoutine,
  hasRoutineChanges,
  planRoutineUpdate,
} from "../session-changes";

const noWarmups = () => false;

function routine(
  ...entries: (string | [string, number | null, (number | null)?])[]
): RoutineChangeRoutineItem[] {
  return entries.map((entry, position) => {
    const [exerciseId, supersetGroup, targetRestSeconds] =
      typeof entry === "string" ? [entry, null, null] : entry;
    return {
      id: `row-${exerciseId}`,
      exerciseId,
      position,
      supersetGroup,
      targetRestSeconds: targetRestSeconds ?? null,
    };
  });
}

function session(
  ...entries: (string | [string, number | null, (number | null)?, number?])[]
): RoutineChangeSessionItem[] {
  return entries.map((entry) => {
    const [exerciseId, supersetGroup, restSeconds, workingSetCount] =
      typeof entry === "string" ? [entry, null, null, 3] : entry;
    return {
      exerciseId,
      supersetGroup,
      restSeconds: restSeconds ?? null,
      workingSetCount: workingSetCount ?? 3,
    };
  });
}

describe("diffSessionAgainstRoutine", () => {
  it("finds nothing when the workout followed the routine", () => {
    const changes = diffSessionAgainstRoutine(
      routine("a", ["b", 1], ["c", 1]),
      session("a", ["b", 4], ["c", 4]),
      noWarmups,
    );
    expect(hasRoutineChanges(changes)).toBe(false);
  });

  it("finds added and removed exercises, including a replacement", () => {
    const changes = diffSessionAgainstRoutine(
      routine("a", "b", "c"),
      session("a", "x", "c", "y"),
      noWarmups,
    );
    expect(changes.added).toEqual(["x", "y"]);
    expect(changes.removed).toEqual(["b"]);
    expect(changes.reordered).toBe(false);
  });

  it("finds a new order", () => {
    const changes = diffSessionAgainstRoutine(
      routine("a", "b", "c"),
      session("c", "a", "b"),
      noWarmups,
    );
    expect(changes.reordered).toBe(true);
    expect(hasRoutineChanges(changes)).toBe(true);
  });

  it("finds supersets formed or broken, whatever their group numbers", () => {
    expect(
      diffSessionAgainstRoutine(routine("a", "b"), session(["a", 2], ["b", 2]), noWarmups)
        .supersetsChanged,
    ).toBe(true);
    expect(
      diffSessionAgainstRoutine(routine(["a", 1], ["b", 1]), session("a", "b"), noWarmups)
        .supersetsChanged,
    ).toBe(true);
  });

  it("finds a rest changed from the ⋯ menu, but not one left alone", () => {
    const changes = diffSessionAgainstRoutine(
      routine(["a", null, 90], ["b", null, 120]),
      session(["a", null, 60], ["b", null, null]),
      noWarmups,
    );
    expect(changes.restChanged).toEqual(["a"]);
  });

  it("ignores warm-up exercises and duplicate routine rows", () => {
    const isWarmup = (id: string) => id.startsWith("w");
    const changes = diffSessionAgainstRoutine(
      [
        ...routine("w1", "a", "b"),
        { id: "dupe", exerciseId: "a", position: 5, supersetGroup: null, targetRestSeconds: null },
      ],
      session("a", "b"),
      isWarmup,
    );
    expect(hasRoutineChanges(changes)).toBe(false);
  });
});

describe("planRoutineUpdate", () => {
  it("writes nothing when the workout followed the routine", () => {
    expect(planRoutineUpdate(routine("a", "b"), session("a", "b"), noWarmups)).toEqual({
      updates: [],
      additions: [],
      removals: [],
    });
  });

  it("reorders kept rows, adds new ones with today's sets and removes dropped ones", () => {
    const plan = planRoutineUpdate(
      routine("a", "b", "c"),
      session("c", ["x", null, 45, 4], "a"),
      noWarmups,
    );
    expect(plan.removals).toEqual(["row-b"]);
    expect(plan.updates).toEqual([
      { id: "row-c", position: 0, supersetGroup: null, targetRestSeconds: null },
      { id: "row-a", position: 2, supersetGroup: null, targetRestSeconds: null },
    ]);
    expect(plan.additions).toEqual([
      { exerciseId: "x", position: 1, supersetGroup: null, targetRestSeconds: 45, targetSets: 4 },
    ]);
  });

  it("carries supersets and rest changes onto kept rows", () => {
    const plan = planRoutineUpdate(
      routine(["a", null, 90], "b"),
      session(["a", 7, 60], ["b", 7]),
      noWarmups,
    );
    expect(plan.updates).toEqual([
      { id: "row-a", position: 0, supersetGroup: 1, targetRestSeconds: 60 },
      { id: "row-b", position: 1, supersetGroup: 1, targetRestSeconds: null },
    ]);
  });

  it("keeps the routine's warm-ups first and their supersets apart from the main ones", () => {
    const isWarmup = (id: string) => id.startsWith("w");
    const plan = planRoutineUpdate(
      routine("a", ["w1", 1], ["w2", 1]),
      session(["a", 1], ["x", 1, null, 0]),
      isWarmup,
    );
    expect(plan.updates).toEqual([
      { id: "row-w1", position: 0, supersetGroup: 1, targetRestSeconds: null },
      { id: "row-w2", position: 1, supersetGroup: 1, targetRestSeconds: null },
      { id: "row-a", position: 2, supersetGroup: 2, targetRestSeconds: null },
    ]);
    expect(plan.additions).toEqual([
      { exerciseId: "x", position: 3, supersetGroup: 2, targetRestSeconds: null, targetSets: null },
    ]);
  });
});
