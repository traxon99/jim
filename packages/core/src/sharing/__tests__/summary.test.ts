import { describe, expect, it } from "vitest";
import type { ShareSnapshot, SharedExercise, SharedRoutine, SharedRoutineItem } from "../snapshot";
import {
  estimateRoutineMinutes,
  listNames,
  shareSnapshotSummary,
  shareSummaryStats,
} from "../summary";

function exercise(name: string, overrides: Partial<SharedExercise> = {}): SharedExercise {
  return {
    slug: name.toLowerCase(),
    name,
    global: true,
    trackingType: "weight_reps",
    category: "strength",
    equipment: null,
    mechanic: null,
    force: null,
    level: null,
    primaryMuscles: [],
    secondaryMuscles: [],
    instructions: [],
    ...overrides,
  };
}

function item(
  exerciseIndex: number,
  overrides: Partial<SharedRoutineItem> = {},
): SharedRoutineItem {
  return {
    exercise: exerciseIndex,
    supersetGroup: null,
    targetSets: null,
    targetRepsLow: null,
    targetRepsHigh: null,
    targetRestSeconds: null,
    targetDurationSeconds: null,
    targetWeight: null,
    notes: null,
    progressionRule: null,
    ...overrides,
  };
}

function routine(name: string, items: SharedRoutineItem[], overrides: Partial<SharedRoutine> = {}) {
  return {
    name,
    notes: null,
    kind: "strength",
    iconShape: "square",
    iconColor: "red",
    warmupMinutes: null,
    warmupRoutine: null,
    items,
    ...overrides,
  } satisfies SharedRoutine;
}

const EXERCISES = [
  exercise("Bench Press"),
  exercise("Row"),
  exercise("Plank", { trackingType: "time" }),
];

function routineShare(routines: SharedRoutine[]): ShareSnapshot {
  return {
    version: 1,
    kind: "routine",
    units: "lb",
    exercises: EXERCISES,
    routines,
    program: null,
  };
}

// Bench: 3 × (15s setup + 5 reps × 3s) + 2 × 180s rest + 60s change = 510s.
const BENCH = item(0, {
  targetSets: 3,
  targetRepsLow: 5,
  targetRepsHigh: 5,
  targetRestSeconds: 180,
});
// Row: 3 default sets × (15 + 10 × 3) + 2 × 90s default rest + 60s = 375s.
const ROW = item(1, { targetRepsLow: 8, targetRepsHigh: 12 });

describe("estimateRoutineMinutes", () => {
  it("times sets, rest and changeovers, rounded to 5 minutes", () => {
    // 885s is 14.75 min.
    expect(estimateRoutineMinutes(routineShare([routine("Push", [BENCH, ROW])]), 0)).toBe(15);
  });

  it("adds the warm-up minutes, or the linked warm-up routine instead", () => {
    const withMinutes = routineShare([routine("Push", [BENCH, ROW], { warmupMinutes: 10 })]);
    expect(estimateRoutineMinutes(withMinutes, 0)).toBe(25);

    // Plank: 2 × 60s hold + 1 × 30s rest + 60s = 210s, on top of 885s.
    const plank = item(2, { targetSets: 2, targetDurationSeconds: 60, targetRestSeconds: 30 });
    const linked = routineShare([
      routine("Push", [BENCH, ROW], { warmupMinutes: 10, warmupRoutine: 1 }),
      routine("Core", [plank], { kind: "warmup" }),
    ]);
    expect(estimateRoutineMinutes(linked, 0)).toBe(20);
  });

  it("only rests after the last exercise of a superset round", () => {
    const a = item(0, {
      targetSets: 3,
      targetRepsLow: 10,
      supersetGroup: 1,
      targetRestSeconds: 120,
    });
    const b = item(1, {
      targetSets: 3,
      targetRepsLow: 10,
      supersetGroup: 1,
      targetRestSeconds: 120,
    });
    // a: 3 × 45 + 60 = 195s; b: 3 × 45 + 2 × 120 + 60 = 435s; 630s is 10.5 min.
    expect(estimateRoutineMinutes(routineShare([routine("SS", [a, b])]), 0)).toBe(10);
  });

  it("is null for an empty routine and at least 5 minutes otherwise", () => {
    expect(estimateRoutineMinutes(routineShare([routine("Empty", [])]), 0)).toBeNull();
    const tiny = item(2, { targetSets: 1, targetDurationSeconds: 20 });
    expect(estimateRoutineMinutes(routineShare([routine("Tiny", [tiny])]), 0)).toBe(5);
  });
});

describe("shareSnapshotSummary", () => {
  it("summarizes a routine", () => {
    const summary = shareSnapshotSummary(routineShare([routine("Push", [BENCH, ROW])]));
    expect(summary).toEqual({
      kind: "routine",
      name: "Push",
      exercises: 2,
      sets: 3,
      minutes: 15,
      exerciseNames: ["Bench Press", "Row"],
    });
    expect(shareSummaryStats(summary)).toEqual(["~15 min", "2 exercises", "3 sets"]);
  });

  it("summarizes a weekly program by its days and typical session", () => {
    const snapshot: ShareSnapshot = {
      ...routineShare([routine("Push", [BENCH, ROW]), routine("Pull", [ROW])]),
      kind: "program",
      program: {
        name: "PPL",
        notes: null,
        mode: "weekly",
        durationWeeks: 8,
        entries: [
          { routine: 0, weekday: 1 },
          { routine: null, weekday: 2 },
          { routine: 1, weekday: 3 },
          { routine: 0, weekday: 5 },
        ],
      },
    };
    const summary = shareSnapshotSummary(snapshot);
    // Push is 15 min and Pull 375s (5 min): a 10 min average.
    expect(summary).toEqual({
      kind: "program",
      name: "PPL",
      routines: 2,
      workouts: 3,
      mode: "weekly",
      weeks: 8,
      minutes: 10,
      routineNames: ["Push", "Pull"],
    });
    expect(shareSummaryStats(summary)).toEqual(["8 weeks", "3× a week", "~10 min sessions"]);
  });
});

describe("listNames", () => {
  it("lists up to three names, then counts the rest", () => {
    expect(listNames(["A", "B"])).toBe("A, B");
    expect(listNames(["A", "B", "C", "D", "E"])).toBe("A, B, C +2 more");
  });
});
