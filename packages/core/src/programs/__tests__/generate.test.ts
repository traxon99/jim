import { describe, expect, it } from "vitest";
import {
  GENERATOR_DAYS_PER_WEEK,
  type GenerateProgramInput,
  type GeneratorExercise,
  exercisesPerSession,
  generateProgram,
} from "../generate";

function exercise(
  slug: string,
  equipment: string | null,
  primaryMuscles: string[],
  mechanic: "compound" | "isolation",
  overrides: Partial<GeneratorExercise> = {},
): GeneratorExercise {
  return {
    id: `id-${slug}`,
    slug,
    name: slug,
    primaryMuscles,
    equipment,
    mechanic,
    level: "beginner",
    trackingType: equipment === "body only" ? "bodyweight" : "weight_reps",
    category: "strength",
    isArchived: false,
    ...overrides,
  };
}

const CATALOG: GeneratorExercise[] = [
  exercise("barbell-squat", "barbell", ["quadriceps"], "compound"),
  exercise("front-squat-clean-grip", "barbell", ["quadriceps"], "compound"),
  exercise("goblet-squat", "kettlebells", ["quadriceps"], "compound"),
  exercise("dumbbell-squat", "dumbbell", ["quadriceps"], "compound"),
  exercise("bodyweight-squat", "body only", ["quadriceps"], "compound"),
  exercise("leg-press", "machine", ["quadriceps"], "compound"),
  exercise("barbell-deadlift", "barbell", ["lower back"], "compound"),
  exercise("romanian-deadlift", "barbell", ["hamstrings"], "compound"),
  exercise("stiff-legged-dumbbell-deadlift", "dumbbell", ["hamstrings"], "compound"),
  exercise("barbell-bench-press-medium-grip", "barbell", ["chest"], "compound"),
  exercise("barbell-incline-bench-press-medium-grip", "barbell", ["chest"], "compound"),
  exercise("dumbbell-bench-press", "dumbbell", ["chest"], "compound"),
  exercise("incline-dumbbell-press", "dumbbell", ["chest"], "compound"),
  exercise("pushups", "body only", ["chest"], "compound"),
  exercise("standing-military-press", "barbell", ["shoulders"], "compound"),
  exercise("dumbbell-shoulder-press", "dumbbell", ["shoulders"], "compound"),
  exercise("bent-over-barbell-row", "barbell", ["middle back"], "compound"),
  exercise("one-arm-dumbbell-row", "dumbbell", ["middle back"], "compound"),
  exercise("seated-cable-rows", "cable", ["middle back"], "compound"),
  exercise("pullups", "body only", ["lats"], "compound"),
  exercise("chin-up", "body only", ["lats"], "compound"),
  exercise("wide-grip-lat-pulldown", "cable", ["lats"], "compound"),
  exercise("dumbbell-lunges", "dumbbell", ["quadriceps"], "compound"),
  exercise("leg-extensions", "machine", ["quadriceps"], "isolation"),
  exercise("lying-leg-curls", "machine", ["hamstrings"], "isolation"),
  exercise("barbell-hip-thrust", "barbell", ["glutes"], "compound"),
  exercise("dumbbell-flyes", "dumbbell", ["chest"], "isolation"),
  exercise("side-lateral-raise", "dumbbell", ["shoulders"], "isolation"),
  exercise("reverse-flyes", "dumbbell", ["shoulders"], "isolation"),
  exercise("barbell-curl", "barbell", ["biceps"], "isolation"),
  exercise("dumbbell-bicep-curl", "dumbbell", ["biceps"], "isolation"),
  exercise("ez-bar-curl", "e-z curl bar", ["biceps"], "isolation"),
  exercise("triceps-pushdown", "cable", ["triceps"], "isolation"),
  exercise("dumbbell-one-arm-triceps-extension", "dumbbell", ["triceps"], "isolation"),
  exercise("bench-dips", "body only", ["triceps"], "compound"),
  exercise("standing-dumbbell-calf-raise", "dumbbell", ["calves"], "isolation"),
  exercise("standing-calf-raises", "machine", ["calves"], "isolation"),
  exercise("crunches", "body only", ["abdominals"], "isolation"),
  exercise("plank", "body only", ["abdominals"], "isolation"),
  exercise("curated-plank-hold", "body only", ["abdominals"], "isolation", {
    trackingType: "time",
  }),
  exercise("mystery-rig-row", "other", ["middle back"], "compound"),
  exercise("unlabeled-press", null, ["chest"], "compound"),
  exercise("snatch", "barbell", ["quadriceps"], "compound", { level: "expert" }),
];

const bySlug = new Map(CATALOG.map((e) => [e.slug, e]));

function input(overrides: Partial<GenerateProgramInput> = {}): GenerateProgramInput {
  return {
    goal: "hypertrophy",
    daysPerWeek: 4,
    sessionMinutes: 60,
    equipment: ["barbell", "dumbbell", "cable", "machine", "body only"],
    experience: "intermediate",
    focusLifts: [],
    exercises: CATALOG,
    ...overrides,
  };
}

function allSlugs(result: ReturnType<typeof generateProgram>): string[] {
  return result.template.days.flatMap((day) => day.routine.items.map((item) => item.slug));
}

describe("generateProgram", () => {
  it.each(GENERATOR_DAYS_PER_WEEK)("schedules %i distinct weekdays", (days) => {
    const result = generateProgram(input({ daysPerWeek: days }));
    const weekdays = result.template.days.map((day) => day.weekday);
    expect(weekdays).toHaveLength(days);
    expect(new Set(weekdays).size).toBe(days);
    for (const weekday of weekdays) {
      expect(weekday).toBeGreaterThanOrEqual(0);
      expect(weekday).toBeLessThanOrEqual(6);
    }
    for (const day of result.template.days) {
      expect(day.routine.items.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic", () => {
    expect(generateProgram(input())).toEqual(generateProgram(input()));
  });

  it("only uses exercises matching the chosen equipment", () => {
    for (const equipment of [
      ["dumbbell"],
      ["body only"],
      ["barbell"],
      ["dumbbell", "body only"],
    ] as const) {
      const result = generateProgram(input({ daysPerWeek: 3, equipment }));
      const slugs = allSlugs(result);
      expect(slugs.length).toBeGreaterThan(0);
      for (const slug of slugs) {
        const raw = bySlug.get(slug)?.equipment;
        const normalized = raw === "e-z curl bar" ? "barbell" : raw;
        expect(equipment).toContain(normalized);
      }
    }
  });

  it("never picks unlabeled, 'other', archived, expert or warm-up exercises", () => {
    const catalog = [
      ...CATALOG,
      exercise("archived-squat", "barbell", ["quadriceps"], "compound", { isArchived: true }),
      exercise("warmup-squat", "barbell", ["quadriceps"], "compound", { category: "warmup" }),
    ];
    const slugs = allSlugs(generateProgram(input({ daysPerWeek: 6, exercises: catalog })));
    for (const bad of [
      "mystery-rig-row",
      "unlabeled-press",
      "snatch",
      "archived-squat",
      "warmup-squat",
    ]) {
      expect(slugs).not.toContain(bad);
    }
  });

  it("fits the session length", () => {
    for (const minutes of [30, 45, 60, 75, 90]) {
      const result = generateProgram(input({ daysPerWeek: 6, sessionMinutes: minutes }));
      for (const day of result.template.days) {
        expect(day.routine.items.length).toBeLessThanOrEqual(exercisesPerSession(minutes));
      }
    }
    expect(exercisesPerSession(30)).toBe(3);
    expect(exercisesPerSession(90)).toBe(7);
  });

  it("never repeats an exercise within a day", () => {
    const result = generateProgram(input({ daysPerWeek: 6, sessionMinutes: 90 }));
    for (const day of result.template.days) {
      const slugs = day.routine.items.map((item) => item.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("puts focus lifts first with the heaviest prescription and reports them", () => {
    const result = generateProgram(
      input({ goal: "strength", daysPerWeek: 3, sessionMinutes: 30, focusLifts: ["deadlift"] }),
    );
    const dayB = result.template.days[1]?.routine;
    expect(dayB?.items[0]).toMatchObject({ slug: "barbell-deadlift", sets: 5, reps: 3 });
    expect(result.focusSlugs).toEqual(["barbell-deadlift"]);
    expect(result.template.notes).toContain("Deadlift");
  });

  it("keeps focus lifts even when the session is too short for the whole day", () => {
    // Full Body A lists squat, press, row first — a pull-up focus has to jump the queue.
    const result = generateProgram(
      input({ daysPerWeek: 3, sessionMinutes: 30, focusLifts: ["pull-up"] }),
    );
    const slugs = allSlugs(result);
    expect(slugs).toContain("pullups");
    expect(result.focusSlugs).toEqual(["pullups"]);
  });

  it("uses the dumbbell variant of a focus lift when there's no barbell", () => {
    const result = generateProgram(
      input({ equipment: ["dumbbell", "body only"], focusLifts: ["bench", "squat"] }),
    );
    expect(result.focusSlugs).toEqual(["dumbbell-bench-press", "dumbbell-squat"]);
  });

  it("programs time-tracked exercises in seconds", () => {
    const catalog = CATALOG.filter((e) => e.slug !== "crunches" && e.slug !== "plank");
    const result = generateProgram(
      input({ daysPerWeek: 4, sessionMinutes: 90, equipment: ["body only"], exercises: catalog }),
    );
    const hold = result.template.days
      .flatMap((day) => day.routine.items)
      .find((item) => item.slug === "curated-plank-hold");
    expect(hold).toMatchObject({ seconds: 45 });
    expect(hold?.reps).toBeUndefined();
  });

  it("caps novice volume at three sets", () => {
    const result = generateProgram(input({ goal: "strength", experience: "novice" }));
    for (const item of result.template.days.flatMap((day) => day.routine.items)) {
      expect(item.sets).toBeLessThanOrEqual(3);
    }
  });

  it("drops slots and days nothing fits instead of failing", () => {
    const result = generateProgram(input({ daysPerWeek: 2, equipment: ["kettlebells"] }));
    // Full Body B's lunge slot falls back to the goblet squat; nothing else fits.
    expect(result.template.days.map((day) => day.routine.items.map((i) => i.slug))).toEqual([
      ["goblet-squat"],
      ["goblet-squat"],
    ]);

    const none = generateProgram(input({ daysPerWeek: 2, equipment: ["bands"] }));
    expect(none.template.days).toEqual([]);
  });
});
