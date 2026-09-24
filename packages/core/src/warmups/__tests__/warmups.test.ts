import { describe, expect, it } from "vitest";
import { MUSCLES } from "../../exercises/muscles";
import { WARMUP_EXERCISES } from "../catalog";
import { exerciseCategoryOf, isWarmupExercise, isWarmupRoutine } from "../category";
import { warmupFrequency } from "../frequency";
import { isWarmupComplete, partitionWarmups, planSessionExercises } from "../session-plan";
import { WARMUP_TEMPLATES, instantiateWarmupTemplate } from "../templates";
import { formatClock, warmupTimerState } from "../timer";

describe("WARMUP_EXERCISES", () => {
  it("covers every muscle group in the controlled vocabulary", () => {
    const covered = new Set(
      WARMUP_EXERCISES.flatMap((e) => [...e.primaryMuscles, ...e.secondaryMuscles]),
    );
    expect(MUSCLES.filter((m) => !covered.has(m))).toEqual([]);
  });

  it("has unique, warmup-prefixed slugs and only reps/time tracking", () => {
    const slugs = WARMUP_EXERCISES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const e of WARMUP_EXERCISES) {
      expect(e.slug.startsWith("warmup-")).toBe(true);
      expect(["bodyweight", "time"]).toContain(e.trackingType);
      expect(e.instructions.length).toBeGreaterThan(0);
    }
  });
});

describe("WARMUP_TEMPLATES", () => {
  it("only references catalog slugs, with reps for rep-based and seconds for timed exercises", () => {
    const bySlug = new Map(WARMUP_EXERCISES.map((e) => [e.slug, e]));
    for (const template of WARMUP_TEMPLATES) {
      for (const item of template.items) {
        const exercise = bySlug.get(item.slug);
        expect(exercise, `${template.key}: ${item.slug}`).toBeDefined();
        if (exercise?.trackingType === "time") {
          expect(item.seconds).toBeGreaterThan(0);
          expect(item.reps).toBeUndefined();
        } else {
          expect(item.reps).toBeGreaterThan(0);
          expect(item.seconds).toBeUndefined();
        }
      }
    }
  });

  it("has unique keys", () => {
    const keys = WARMUP_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("instantiateWarmupTemplate", () => {
  const template = {
    key: "t",
    name: "Test warm-up",
    notes: "n",
    minutes: 5,
    items: [
      { slug: "a", sets: 1, reps: 10 },
      { slug: "missing", sets: 1, reps: 5 },
      { slug: "b", sets: 2, seconds: 30 },
    ],
  };

  it("resolves slugs to local exercise ids and reports the ones not synced yet", () => {
    let n = 0;
    const result = instantiateWarmupTemplate(
      template,
      new Map([
        ["a", "ex-a"],
        ["b", "ex-b"],
      ]),
      () => `id-${n++}`,
    );
    expect(result.routine).toMatchObject({
      name: "Test warm-up",
      kind: "warmup",
      warmupMinutes: 5,
    });
    expect(result.items).toEqual([
      {
        id: "id-0",
        exerciseId: "ex-a",
        position: 0,
        targetSets: 1,
        targetRepsLow: 10,
        targetRepsHigh: 10,
        targetDurationSeconds: null,
      },
      {
        id: "id-1",
        exerciseId: "ex-b",
        position: 1,
        targetSets: 2,
        targetRepsLow: null,
        targetRepsHigh: null,
        targetDurationSeconds: 30,
      },
    ]);
    expect(result.routine.id).toBe("id-2");
    expect(result.missingSlugs).toEqual(["missing"]);
  });
});

describe("category helpers", () => {
  it("treats a missing category/kind (rows cached before the column existed) as strength", () => {
    expect(exerciseCategoryOf({})).toBe("strength");
    expect(exerciseCategoryOf({ category: null })).toBe("strength");
    expect(isWarmupExercise({ category: "warmup" })).toBe(true);
    expect(isWarmupRoutine({})).toBe(false);
    expect(isWarmupRoutine({ kind: "warmup" })).toBe(true);
  });
});

describe("planSessionExercises", () => {
  const warm = new Set(["stretch-1", "stretch-2", "stretch-3"]);
  const isWarm = (id: string) => warm.has(id);

  it("puts the linked warm-up first, then the routine's own warm-ups, then the rest", () => {
    const routine = [
      { exerciseId: "squat", position: 0 },
      { exerciseId: "stretch-3", position: 1 },
      { exerciseId: "lunge", position: 2 },
    ];
    const warmup = [
      { exerciseId: "stretch-2", position: 1 },
      { exerciseId: "stretch-1", position: 0 },
    ];
    expect(
      planSessionExercises(routine, warmup, isWarm).map((p) => [
        p.item.exerciseId,
        p.position,
        p.isWarmup,
      ]),
    ).toEqual([
      ["stretch-1", 0, true],
      ["stretch-2", 1, true],
      ["stretch-3", 2, true],
      ["squat", 3, false],
      ["lunge", 4, false],
    ]);
  });

  it("includes an exercise present in both only once, in the warm-up", () => {
    const routine = [
      { exerciseId: "stretch-1", position: 0 },
      { exerciseId: "squat", position: 1 },
    ];
    const warmup = [{ exerciseId: "stretch-1", position: 0 }];
    expect(planSessionExercises(routine, warmup, isWarm).map((p) => p.item.exerciseId)).toEqual([
      "stretch-1",
      "squat",
    ]);
  });

  it("keeps a routine with no warm-ups in its original order", () => {
    const routine = [
      { exerciseId: "b", position: 1 },
      { exerciseId: "a", position: 0 },
    ];
    expect(planSessionExercises(routine, [], isWarm).map((p) => p.item.exerciseId)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("partitionWarmups", () => {
  it("groups by exercise category, keeping order within each group", () => {
    const items = [{ exerciseId: "squat" }, { exerciseId: "s1" }, { exerciseId: "s2" }];
    const result = partitionWarmups(items, (id) => id.startsWith("s") && id !== "squat");
    expect(result.warmups.map((i) => i.exerciseId)).toEqual(["s1", "s2"]);
    expect(result.main.map((i) => i.exerciseId)).toEqual(["squat"]);
  });
});

describe("isWarmupComplete", () => {
  it("is false for an empty block", () => {
    expect(isWarmupComplete([])).toBe(false);
  });

  it("requires every warm-up to reach its target set count", () => {
    expect(
      isWarmupComplete([
        { loggedSetCount: 2, targetSetCount: 2 },
        { loggedSetCount: 1, targetSetCount: 2 },
      ]),
    ).toBe(false);
    expect(
      isWarmupComplete([
        { loggedSetCount: 2, targetSetCount: 2 },
        { loggedSetCount: 3, targetSetCount: 2 },
      ]),
    ).toBe(true);
  });

  it("treats a warm-up without a target as done after one set", () => {
    expect(isWarmupComplete([{ loggedSetCount: 0, targetSetCount: null }])).toBe(false);
    expect(isWarmupComplete([{ loggedSetCount: 1, targetSetCount: null }])).toBe(true);
    expect(isWarmupComplete([{ loggedSetCount: 0, targetSetCount: 0 }])).toBe(false);
  });
});

describe("warmupTimerState", () => {
  const start = new Date("2026-01-01T10:00:00Z");

  it("counts down against a target and flags when it's over", () => {
    expect(warmupTimerState(start, new Date("2026-01-01T10:03:30Z"), 10)).toEqual({
      elapsedSeconds: 210,
      targetSeconds: 600,
      remainingSeconds: 390,
      isOver: false,
    });
    expect(warmupTimerState(start, new Date("2026-01-01T10:11:00Z"), 10)).toMatchObject({
      remainingSeconds: 0,
      isOver: true,
    });
  });

  it("just counts up with no target", () => {
    expect(warmupTimerState(start, new Date("2026-01-01T10:01:00Z"), null)).toEqual({
      elapsedSeconds: 60,
      targetSeconds: null,
      remainingSeconds: null,
      isOver: false,
    });
  });

  it("never reports negative elapsed time for a clock skewed behind the start", () => {
    expect(warmupTimerState(start, new Date("2026-01-01T09:59:00Z"), 5).elapsedSeconds).toBe(0);
  });
});

describe("formatClock", () => {
  it("formats m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3600)).toBe("60:00");
  });
});

describe("warmupFrequency", () => {
  const now = new Date("2026-03-31T12:00:00Z");

  it("counts distinct sessions overall and within the window, and the last time done", () => {
    const sets = [
      { sessionId: "a", completedAt: new Date("2026-01-01T10:00:00Z") },
      { sessionId: "b", completedAt: new Date("2026-03-20T10:00:00Z") },
      { sessionId: "b", completedAt: new Date("2026-03-20T10:01:00Z") },
      { sessionId: "c", completedAt: new Date("2026-03-30T10:00:00Z") },
    ];
    expect(warmupFrequency(sets, now)).toEqual({
      sessionCount: 3,
      recentSessionCount: 2,
      lastDoneAt: new Date("2026-03-30T10:00:00Z"),
    });
  });

  it("is empty for a warm-up never done", () => {
    expect(warmupFrequency([], now)).toEqual({
      sessionCount: 0,
      recentSessionCount: 0,
      lastDoneAt: null,
    });
  });
});
