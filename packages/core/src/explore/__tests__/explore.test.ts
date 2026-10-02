import { describe, expect, it } from "vitest";
import { DPR_MAX_FOCUS } from "../../dpr/presets";
import { MUSCLES } from "../../exercises/muscles";
import { WARMUP_EXERCISES } from "../../warmups/catalog";
import { EXPLORE_WARMUP_TEMPLATES, PROGRAM_TEMPLATES, ROUTINE_TEMPLATES } from "../catalog";
import { CURATED_EXERCISES } from "../curated-exercises";
import {
  type RoutineTemplate,
  instantiateRoutineTemplate,
  routineTemplateSlugs,
} from "../templates";

const curatedBySlug = new Map(CURATED_EXERCISES.map((e) => [e.slug, e]));
const warmupBySlug = new Map(WARMUP_EXERCISES.map((e) => [e.slug, e]));

describe("CURATED_EXERCISES", () => {
  it("has unique, curated-prefixed slugs within the muscle vocabulary", () => {
    const slugs = CURATED_EXERCISES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const e of CURATED_EXERCISES) {
      expect(e.slug.startsWith("curated-")).toBe(true);
      expect(e.instructions.length).toBeGreaterThan(0);
      for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) {
        expect(MUSCLES).toContain(m);
      }
    }
  });
});

describe("Explore templates", () => {
  const allRoutines: RoutineTemplate[] = PROGRAM_TEMPLATES.flatMap((p) => [
    ...p.days.map((d) => d.routine),
    ...p.extraRoutines,
  ]);

  it("offers at least five programs, each with a level, days per week and description", () => {
    expect(PROGRAM_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    for (const program of PROGRAM_TEMPLATES) {
      expect(program.notes.length, program.key).toBeGreaterThan(0);
      expect(program.info.progression.length, program.key).toBeGreaterThan(0);
      expect(program.info.daysPerWeek, program.key).toBeGreaterThan(0);
    }
  });

  it("no longer offers Maddy's Workout Split", () => {
    expect(PROGRAM_TEMPLATES.some((p) => p.name.includes("Maddy"))).toBe(false);
    expect(EXPLORE_WARMUP_TEMPLATES.some((t) => t.name.includes("Maddy"))).toBe(false);
  });

  it("pins weekly days to distinct weekdays and leaves sequence days unpinned", () => {
    for (const program of PROGRAM_TEMPLATES) {
      const weekdays = program.days.map((d) => d.weekday);
      if (program.mode === "weekly") {
        expect(
          weekdays.every((w) => w != null && w >= 0 && w <= 6),
          program.key,
        ).toBe(true);
        expect(new Set(weekdays).size, program.key).toBe(weekdays.length);
        expect(weekdays.length, program.key).toBe(program.info.daysPerWeek);
      } else {
        expect(
          weekdays.every((w) => w === null),
          program.key,
        ).toBe(true);
      }
    }
  });

  it("only picks DPR focus lifts the program actually trains", () => {
    for (const program of PROGRAM_TEMPLATES) {
      const dpr = program.info.dpr;
      if (!dpr) continue;
      const trained = new Set(program.days.flatMap((d) => d.routine.items.map((i) => i.slug)));
      expect(dpr.focusSlugs.length, program.key).toBeGreaterThan(0);
      expect(dpr.focusSlugs.length, program.key).toBeLessThanOrEqual(DPR_MAX_FOCUS);
      for (const slug of dpr.focusSlugs)
        expect(trained.has(slug), `${program.key}: ${slug}`).toBe(true);
    }
  });

  it("gives every routine a name no other template uses", () => {
    const names = allRoutines.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("only references curated/warm-up slugs that exist", () => {
    const slugs = [
      ...allRoutines.flatMap(routineTemplateSlugs),
      ...EXPLORE_WARMUP_TEMPLATES.flatMap((t) => t.items.map((i) => i.slug)),
    ];
    for (const slug of slugs) {
      if (slug.startsWith("curated-")) expect(curatedBySlug.has(slug), slug).toBe(true);
      if (slug.startsWith("warmup-")) expect(warmupBySlug.has(slug), slug).toBe(true);
    }
  });

  it("uses seconds for timed exercises and never reps", () => {
    const timed = new Set([
      ...[...CURATED_EXERCISES, ...WARMUP_EXERCISES]
        .filter((e) => e.trackingType === "time")
        .map((e) => e.slug),
      // free-exercise-db's stretching category seeds as time-tracked.
      "standing-toe-touches",
    ]);
    const items = [
      ...allRoutines.flatMap((r) => [...(r.warmup?.items ?? []), ...r.items]),
      ...EXPLORE_WARMUP_TEMPLATES.flatMap((t) => t.items),
    ];
    for (const item of items) {
      if (timed.has(item.slug)) expect(item.reps, item.slug).toBeUndefined();
      else expect(item.seconds, item.slug).toBeUndefined();
    }
  });

  it("has unique keys across routines and warm-ups", () => {
    const keys = [
      ...PROGRAM_TEMPLATES.map((p) => p.key),
      ...allRoutines.map((r) => r.key),
      ...allRoutines.flatMap((r) => (r.warmup ? [r.warmup.key] : [])),
      ...EXPLORE_WARMUP_TEMPLATES.map((t) => t.key),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("offers every program routine individually", () => {
    expect(ROUTINE_TEMPLATES.map((r) => r.key)).toEqual(allRoutines.map((r) => r.key));
  });

  it("pairs every superset group", () => {
    for (const routine of allRoutines) {
      const counts = new Map<number, number>();
      for (const item of routine.items) {
        if (item.superset != null) counts.set(item.superset, (counts.get(item.superset) ?? 0) + 1);
      }
      for (const count of counts.values()) expect(count).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("instantiateRoutineTemplate", () => {
  const template: RoutineTemplate = {
    key: "t",
    name: "Test",
    notes: "n",
    items: [
      { slug: "a", sets: 3, reps: 8, repsHigh: 12, superset: 1, notes: "focus" },
      { slug: "missing", sets: 3, reps: 5 },
      { slug: "b", sets: 1, seconds: 60 },
    ],
  };

  it("resolves slugs, keeps rep ranges/supersets/notes, and reports missing slugs", () => {
    let n = 0;
    const result = instantiateRoutineTemplate(
      template,
      new Map([
        ["a", "ex-a"],
        ["b", "ex-b"],
      ]),
      () => `id-${n++}`,
    );
    expect(result.missingSlugs).toEqual(["missing"]);
    expect(result.routine).toMatchObject({ name: "Test", notes: "n", kind: "strength" });
    expect(result.items).toEqual([
      {
        id: "id-0",
        exerciseId: "ex-a",
        position: 0,
        supersetGroup: 1,
        targetSets: 3,
        targetRepsLow: 8,
        targetRepsHigh: 12,
        targetDurationSeconds: null,
        notes: "focus",
      },
      {
        id: "id-1",
        exerciseId: "ex-b",
        position: 1,
        supersetGroup: null,
        targetSets: 1,
        targetRepsLow: null,
        targetRepsHigh: null,
        targetDurationSeconds: 60,
        notes: null,
      },
    ]);
  });
});
