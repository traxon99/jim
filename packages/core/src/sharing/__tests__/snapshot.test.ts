import { describe, expect, it } from "vitest";
import {
  type ShareSnapshot,
  type ShareSource,
  type ShareSourceExercise,
  type ShareSourceRoutine,
  type ShareSourceRoutineItem,
  buildProgramShare,
  buildRoutineShare,
  convertShareRule,
  convertShareWeight,
  matchShareExercises,
  parseShareSnapshot,
  shareSnapshotName,
} from "../snapshot";

function exercise(id: string, overrides: Partial<ShareSourceExercise> = {}): ShareSourceExercise {
  return {
    id,
    ownerId: null,
    slug: id,
    name: id,
    trackingType: "weight_reps",
    category: "strength",
    equipment: "barbell",
    mechanic: "compound",
    force: "push",
    level: "beginner",
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    instructions: [],
    ...overrides,
  };
}

function routine(id: string, overrides: Partial<ShareSourceRoutine> = {}): ShareSourceRoutine {
  return {
    id,
    name: id,
    notes: null,
    kind: "strength",
    iconShape: "square",
    iconColor: "red",
    warmupMinutes: null,
    warmupRoutineId: null,
    deletedAt: null,
    ...overrides,
  };
}

function item(
  routineId: string,
  exerciseId: string,
  position: number,
  overrides: Partial<ShareSourceRoutineItem> = {},
): ShareSourceRoutineItem {
  return {
    routineId,
    exerciseId,
    position,
    supersetGroup: null,
    targetSets: 3,
    targetRepsLow: 5,
    targetRepsHigh: 8,
    targetRestSeconds: 120,
    targetDurationSeconds: null,
    targetWeight: "135.00",
    notes: null,
    deletedAt: null,
    ...overrides,
  };
}

const source: ShareSource = {
  units: "lb",
  exercises: [
    exercise("bench"),
    exercise("squat"),
    exercise("my-curl", { ownerId: "sharer", name: "My Curl", primaryMuscles: ["biceps"] }),
    exercise("hip-circles", { category: "warmup", trackingType: "time" }),
  ],
  routines: [
    routine("push", { warmupRoutineId: "warm", notes: " Heavy day " }),
    routine("legs"),
    routine("warm", { kind: "warmup", warmupMinutes: 5 }),
    routine("gone", { deletedAt: new Date() }),
  ],
  routineExercises: [
    item("push", "my-curl", 2, { supersetGroup: 1 }),
    item("push", "bench", 0),
    item("push", "squat", 1, { deletedAt: new Date() }),
    item("legs", "squat", 0),
    item("legs", "bench", 1),
    item("warm", "hip-circles", 0, { targetDurationSeconds: 30, targetWeight: null }),
  ],
};

describe("buildRoutineShare", () => {
  it("keeps exercises, targets and order, plus the linked warm-up", () => {
    const snapshot = buildRoutineShare("push", source);
    expect(snapshot?.kind).toBe("routine");
    expect(snapshot?.routines.map((r) => r.name)).toEqual(["push", "warm"]);
    const [push, warm] = snapshot?.routines ?? [];
    expect(push?.notes).toBe("Heavy day");
    expect(push?.warmupRoutine).toBe(1);
    expect(push?.items.map((i) => snapshot?.exercises[i.exercise]?.name)).toEqual([
      "bench",
      "My Curl",
    ]);
    expect(push?.items[0]).toMatchObject({
      targetSets: 3,
      targetRepsLow: 5,
      targetRepsHigh: 8,
      targetRestSeconds: 120,
      targetWeight: 135,
    });
    expect(push?.items[1]?.supersetGroup).toBe(1);
    expect(warm?.warmupMinutes).toBe(5);
    expect(snapshot?.exercises.map((e) => e.global)).toEqual([true, false, true]);
  });

  it("holds none of the sharer's ids", () => {
    const json = JSON.stringify(buildRoutineShare("push", source));
    expect(json).not.toContain("sharer");
    expect(json).not.toMatch(/"id"/);
  });

  it("is null for a deleted or missing routine", () => {
    expect(buildRoutineShare("gone", source)).toBeNull();
    expect(buildRoutineShare("nope", source)).toBeNull();
  });
});

describe("buildProgramShare", () => {
  it("lists each routine once, rest days included, in order", () => {
    const snapshot = buildProgramShare(
      { name: "PPL", notes: null, mode: "weekly", durationWeeks: 8 },
      [
        { routineId: "legs", position: 2, weekday: 3, deletedAt: null },
        { routineId: "push", position: 0, weekday: 1, deletedAt: null },
        { routineId: null, position: 1, weekday: 2, deletedAt: null },
        { routineId: "push", position: 3, weekday: 5, deletedAt: null },
        { routineId: "gone", position: 4, weekday: 6, deletedAt: null },
      ],
      source,
    );
    expect(snapshot.routines.map((r) => r.name)).toEqual(["push", "warm", "legs"]);
    expect(snapshot.program?.entries).toEqual([
      { routine: 0, weekday: 1 },
      { routine: null, weekday: 2 },
      { routine: 2, weekday: 3 },
      { routine: 0, weekday: 5 },
    ]);
    expect(shareSnapshotName(snapshot)).toBe("PPL");
  });
});

describe("parseShareSnapshot", () => {
  const snapshot = buildRoutineShare("push", source);

  it("round-trips a built snapshot through JSON", () => {
    expect(parseShareSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it("accepts any target the routine editor saves, however big", () => {
    // Jackson's "Torture" routine: a 900-minute warm-up, 100 sets of 90-100
    // reps and an hour of cardio were refused as an "Invalid share".
    const torture = buildRoutineShare("torture", {
      ...source,
      routines: [routine("torture", { warmupMinutes: 900 })],
      routineExercises: [
        item("torture", "squat", 0, { targetSets: 100, targetRepsLow: 90, targetRepsHigh: 100 }),
        item("torture", "bench", 1, {
          targetSets: 999,
          targetRepsLow: 5000,
          targetRepsHigh: 5000,
          targetRestSeconds: 7200,
          targetDurationSeconds: 100_000,
          supersetGroup: 2000,
        }),
      ],
    });
    expect(torture).not.toBeNull();
    expect(parseShareSnapshot(JSON.parse(JSON.stringify(torture)))).toEqual(torture);
  });

  it("rejects out-of-range references and bad values", () => {
    const bad = (patch: (copy: ShareSnapshot) => void) => {
      const copy: ShareSnapshot = JSON.parse(JSON.stringify(snapshot));
      patch(copy);
      return parseShareSnapshot(copy);
    };
    expect(bad((c) => Object.assign(c, { version: 2 }))).toBeNull();
    expect(bad((c) => Object.assign(c, { routines: [] }))).toBeNull();
    expect(bad((c) => Object.assign(c, { kind: "program" }))).toBeNull();
    expect(
      bad((c) => {
        const first = c.routines[0]?.items[0];
        if (first) first.exercise = 99;
      }),
    ).toBeNull();
    expect(
      bad((c) => {
        const first = c.routines[0]?.items[0];
        if (first) Object.assign(first, { progressionRule: { type: "linear", increment: -5 } });
      }),
    ).toBeNull();
    expect(
      bad((c) => {
        const first = c.exercises[0];
        if (first) Object.assign(first, { primaryMuscles: ["spleen"] });
      }),
    ).toBeNull();
    expect(parseShareSnapshot("nope")).toBeNull();
    expect(parseShareSnapshot(null)).toBeNull();
  });
});

describe("matchShareExercises", () => {
  const snapshot = buildRoutineShare("push", source);
  if (!snapshot) throw new Error("expected a snapshot");

  it("prefers the recipient's own copy, then the catalog, and copies the rest", () => {
    const matches = matchShareExercises(snapshot, [
      {
        id: "g-bench",
        ownerId: null,
        slug: "bench",
        name: "bench",
        category: "strength",
        isArchived: false,
      },
      {
        id: "my-bench",
        ownerId: "me",
        slug: "bench",
        name: "Bench",
        category: "strength",
        isArchived: false,
      },
      {
        id: "g-hips",
        ownerId: null,
        slug: "hip-circles",
        name: "Hips",
        category: "warmup",
        isArchived: false,
      },
    ]);
    expect(matches).toEqual(["my-bench", null, "g-hips"]);
  });

  it("matches a custom exercise by name and skips archived ones", () => {
    const matches = matchShareExercises(snapshot, [
      {
        id: "curl",
        ownerId: "me",
        slug: "curl-1",
        name: " my  curl ",
        category: "strength",
        isArchived: false,
      },
      {
        id: "old-bench",
        ownerId: "me",
        slug: "bench",
        name: "bench",
        category: "strength",
        isArchived: true,
      },
    ]);
    expect(matches).toEqual([null, "curl", null]);
  });
});

describe("convertShareWeight", () => {
  it("leaves matching units alone and rounds converted ones to a loadable step", () => {
    expect(convertShareWeight(135, "lb", "lb")).toBe(135);
    expect(convertShareWeight(null, "lb", "kg")).toBeNull();
    expect(convertShareWeight(135, "lb", "kg")).toBe(60);
    expect(convertShareWeight(100, "kg", "lb")).toBe(220);
  });
});

describe("convertShareRule", () => {
  it("moves the increment onto a loadable step in the new units", () => {
    const rule = { type: "linear" as const, increment: 5 };
    expect(convertShareRule(rule, "lb", "lb")).toBe(rule);
    expect(convertShareRule(null, "lb", "kg")).toBeNull();
    expect(convertShareRule(rule, "lb", "kg")?.increment).toBe(2.5);
    expect(convertShareRule({ ...rule, increment: 2.5 }, "kg", "lb")?.increment).toBe(5);
  });
});
