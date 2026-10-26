import { describe, expect, it } from "vitest";
import type { DprDecision } from "../../dpr/decide";
import {
  type InjuryExerciseRule,
  applyInjuryLimit,
  cleanInjuryRule,
  describeInjuryRule,
  exerciseInjuryGuidance,
  injuryLimit,
  injuryPrpEffect,
  markInjuredHistory,
  parseInjuryRules,
  withInjuryRule,
  withoutInjuryRule,
} from "../index";

const rule = (overrides: Partial<InjuryExerciseRule>): InjuryExerciseRule => ({
  exerciseId: "squat",
  effect: "limit",
  maxWeight: null,
  units: null,
  repsLow: null,
  repsHigh: null,
  note: null,
  ...overrides,
});

const KNEE = {
  id: "knee",
  area: "knee",
  side: "left" as const,
  startedOn: "2026-10-10",
  healedOn: null as string | null,
  deletedAt: null,
};
const WRIST = { ...KNEE, id: "wrist", area: "wrist" };

const squat = { id: "squat", primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes"] };
const bench = { id: "bench", primaryMuscles: ["chest"], secondaryMuscles: ["triceps"] };
const legExt = { id: "legExt", primaryMuscles: ["quadriceps"], secondaryMuscles: [] };
const day = (key: string) => new Date(`${key}T12:00:00`);
const localKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

describe("cleaning rules", () => {
  it("keeps limits only on limit and light, and fills a one-ended range", () => {
    expect(
      cleanInjuryRule({ exerciseId: "squat", effect: "avoid", maxWeight: 60, units: "kg" }),
    ).toEqual({ ok: true, rule: rule({ effect: "avoid" }) });
    expect(
      cleanInjuryRule({
        exerciseId: "squat",
        effect: "limit",
        maxWeight: 60,
        units: "kg",
        repsHigh: 12,
      }),
    ).toEqual({
      ok: true,
      rule: rule({ maxWeight: 60, units: "kg", repsLow: 12, repsHigh: 12 }),
    });
  });

  it("rejects bad input", () => {
    const bad = (input: Parameters<typeof cleanInjuryRule>[0]) => cleanInjuryRule(input).ok;
    expect(bad({ exerciseId: " ", effect: "fine" })).toBe(false);
    expect(bad({ exerciseId: "squat", effect: "maybe" })).toBe(false);
    expect(bad({ exerciseId: "squat", effect: "limit" })).toBe(false);
    expect(bad({ exerciseId: "squat", effect: "limit", maxWeight: -5, units: "kg" })).toBe(false);
    expect(bad({ exerciseId: "squat", effect: "limit", maxWeight: 60 })).toBe(false);
    expect(bad({ exerciseId: "squat", effect: "limit", repsLow: 15, repsHigh: 12 })).toBe(false);
    expect(bad({ exerciseId: "squat", effect: "limit", repsLow: 2.5 })).toBe(false);
    expect(bad({ exerciseId: "squat", effect: "limit", note: "slow eccentrics" })).toBe(true);
  });

  it("parses stored JSON leniently", () => {
    expect(parseInjuryRules(undefined)).toEqual([]);
    expect(parseInjuryRules("nope")).toEqual([]);
    expect(
      parseInjuryRules([
        { exerciseId: "squat", effect: "light", repsLow: 12, repsHigh: 15 },
        { exerciseId: "squat", effect: "avoid" },
        { exerciseId: "bench", effect: "explode" },
        null,
      ]),
    ).toEqual([rule({ effect: "light", repsLow: 12, repsHigh: 15 })]);
  });

  it("replaces and removes by exercise", () => {
    const rules = withInjuryRule([rule({ note: "a" })], rule({ effect: "avoid" }));
    expect(rules).toEqual([rule({ effect: "avoid" })]);
    expect(withoutInjuryRule(rules, "squat")).toEqual([]);
  });

  it("describes a rule in the user's units", () => {
    expect(
      describeInjuryRule(rule({ maxWeight: 60, units: "kg", repsLow: 12, repsHigh: 15 }), "kg"),
    ).toBe("up to 60 kg · 12–15 reps");
    expect(describeInjuryRule(rule({ effect: "light", maxWeight: 100, units: "lb" }), "kg")).toBe(
      "Go light · up to 45.36 kg",
    );
    expect(describeInjuryRule(rule({ effect: "avoid" }), "lb")).toBe("Avoid it");
  });
});

describe("guidance", () => {
  it("lets a rule reach an exercise the area's muscles miss", () => {
    const wrist = { ...WRIST, exerciseRules: [rule({ exerciseId: "bench", effect: "light" })] };
    expect(exerciseInjuryGuidance(bench, [wrist], "2026-10-20")).toMatchObject({
      injury: { id: "wrist" },
      hit: null,
      rule: { effect: "light" },
    });
    expect(exerciseInjuryGuidance(bench, [WRIST], "2026-10-20")).toBeNull();
  });

  it("clears an exercise a rule marks fine", () => {
    const knee = { ...KNEE, exerciseRules: [rule({ exerciseId: "legExt", effect: "fine" })] };
    expect(exerciseInjuryGuidance(legExt, [knee], "2026-10-20")).toBeNull();
    expect(exerciseInjuryGuidance(squat, [knee], "2026-10-20")).toMatchObject({
      hit: "primary",
      rule: null,
    });
  });

  it("puts a rule ahead of a plain muscle hit", () => {
    const wrist = { ...WRIST, exerciseRules: [rule({ effect: "avoid" })] };
    expect(exerciseInjuryGuidance(squat, [KNEE, wrist], "2026-10-20")?.injury.id).toBe("wrist");
  });
});

describe("PRP with rules", () => {
  const exercises = new Map([
    ["squat", squat],
    ["legExt", legExt],
  ]);
  const history = [
    { exerciseId: "squat", date: day("2026-10-12"), intensity: null },
    { exerciseId: "legExt", date: day("2026-10-12"), intensity: null },
  ];
  const effect = (exercise: typeof squat, injuries: (typeof KNEE)[]) =>
    injuryPrpEffect({
      exerciseId: exercise.id,
      exercise,
      injuries,
      history,
      today: "2026-10-20",
      dayKeyOf: localKey,
    });

  it("follows the rule instead of the muscle hit", () => {
    const fine = { ...KNEE, exerciseRules: [rule({ exerciseId: "legExt", effect: "fine" })] };
    expect(effect(legExt, [fine])).toBeNull();
    expect(
      markInjuredHistory(history, [fine], (id) => exercises.get(id), localKey).map(
        (entry) => entry.intensity,
      ),
    ).toEqual(["light", null]);
    const limit = { ...KNEE, exerciseRules: [rule({ maxWeight: 100, units: "kg" })] };
    expect(effect(squat, [limit])).toBeNull();
    const wrist = { ...WRIST, exerciseRules: [rule({ exerciseId: "bench", effect: "avoid" })] };
    expect(effect(bench, [wrist])).toBe("light");
  });

  it("eases a lift its rule shaped back in after healing", () => {
    const healed = {
      ...WRIST,
      healedOn: "2026-10-15",
      exerciseRules: [rule({ exerciseId: "bench", effect: "light" })],
    };
    expect(effect(bench, [healed])).toBe("ease");
  });

  const decision: DprDecision = {
    call: "increase",
    weight: 105,
    previousWeight: 100,
    targetReps: 6,
    reason: "Hit 3×6",
    streak: 2,
  };

  it("caps the weight and moves reps into the range", () => {
    const knee = {
      ...KNEE,
      exerciseRules: [rule({ maxWeight: 200, units: "lb", repsLow: 10, repsHigh: 15 })],
    };
    const wrist = {
      ...WRIST,
      exerciseRules: [rule({ effect: "light", repsLow: 12, repsHigh: 20 })],
    };
    const limit = injuryLimit({
      exerciseId: "squat",
      injuries: [knee, wrist],
      today: "2026-10-20",
      units: "kg",
    });
    expect(limit).toEqual({ maxWeight: 90.72, reps: { low: 12, high: 15 } });
    expect(applyInjuryLimit(decision, limit, 2.5)).toMatchObject({
      call: "hold",
      weight: 90,
      targetReps: 12,
      reason: "Injury rule — capped at 90",
    });
    expect(applyInjuryLimit(decision, null, 2.5)).toBe(decision);
    expect(
      injuryLimit({ exerciseId: "squat", injuries: [KNEE], today: "2026-10-20", units: "kg" }),
    ).toBeNull();
  });
});
