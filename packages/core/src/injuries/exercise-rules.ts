import { convertWeight } from "../data-transfer/workout-csv";
import type { WeightUnits } from "../dpr/equipment-increments";

/**
 * Exercise rules (issue #724, CONTEXT.md "Exercise rule"): how one injury
 * treats one exercise, in place of the area-wide treatment (pain bands and
 * PRP's light day). A rule applies while its injury is open, whether or not
 * the exercise works the injured area's muscles, so "bench bothers my
 * wrist" works even though bench doesn't list the forearms.
 *
 * - fine: this exercise doesn't bother the injury; no hint, PRP as normal.
 * - limit: train it, within a weight cap and/or rep range.
 * - light: go light (PRP's light day), optionally within a cap or range.
 * - avoid: skip or swap it.
 */
export const INJURY_RULE_EFFECTS = ["fine", "limit", "light", "avoid"] as const;
export type InjuryRuleEffect = (typeof INJURY_RULE_EFFECTS)[number];

export const INJURY_RULE_EFFECT_LABELS: Readonly<Record<InjuryRuleEffect, string>> = {
  fine: "Fine as is",
  limit: "Limit it",
  light: "Go light",
  avoid: "Avoid it",
};

export const INJURY_RULE_NOTE_MAX = 200;
/** Rules per injury; far more than anyone needs, but keeps one row's JSON small. */
export const INJURY_RULES_MAX = 50;
/** Most reps a rule's range may name. */
export const INJURY_RULE_REPS_MAX = 100;

export interface InjuryExerciseRule {
  exerciseId: string;
  effect: InjuryRuleEffect;
  /** Heaviest weight to use, in `units`; limit and light only. */
  maxWeight: number | null;
  /** The units `maxWeight` was written in, so a later units switch converts it. */
  units: WeightUnits | null;
  /** Rep range to stay in; limit and light only. */
  repsLow: number | null;
  repsHigh: number | null;
  note: string | null;
}

/** Whether an effect takes a weight cap and rep range. */
export function ruleTakesLimits(effect: InjuryRuleEffect): boolean {
  return effect === "limit" || effect === "light";
}

function isEffect(value: unknown): value is InjuryRuleEffect {
  return typeof value === "string" && (INJURY_RULE_EFFECTS as readonly string[]).includes(value);
}

export interface InjuryRuleInput {
  exerciseId: string;
  effect: string;
  maxWeight?: number | null;
  units?: WeightUnits | null;
  repsLow?: number | null;
  repsHigh?: number | null;
  note?: string | null;
}

/** Validates and trims one rule; returns an error message, or the cleaned rule. */
export function cleanInjuryRule(
  input: InjuryRuleInput,
): { ok: true; rule: InjuryExerciseRule } | { ok: false; error: string } {
  const exerciseId = input.exerciseId.trim();
  if (!exerciseId) return { ok: false, error: "Pick an exercise" };
  if (!isEffect(input.effect)) {
    return { ok: false, error: `Effect is one of ${INJURY_RULE_EFFECTS.join(", ")}` };
  }
  const limits = ruleTakesLimits(input.effect);
  const maxWeight = limits ? (input.maxWeight ?? null) : null;
  if (maxWeight !== null && !(Number.isFinite(maxWeight) && maxWeight > 0 && maxWeight < 10000)) {
    return { ok: false, error: "Max weight is a weight above 0" };
  }
  if (maxWeight !== null && input.units !== "kg" && input.units !== "lb") {
    return { ok: false, error: "Say whether the max weight is kg or lb" };
  }
  let repsLow = limits ? (input.repsLow ?? null) : null;
  let repsHigh = limits ? (input.repsHigh ?? null) : null;
  for (const reps of [repsLow, repsHigh]) {
    if (reps !== null && !(Number.isInteger(reps) && reps >= 1 && reps <= INJURY_RULE_REPS_MAX)) {
      return { ok: false, error: `Reps are whole numbers from 1 to ${INJURY_RULE_REPS_MAX}` };
    }
  }
  // One end given: a single rep target.
  repsLow ??= repsHigh;
  repsHigh ??= repsLow;
  if (repsLow !== null && repsHigh !== null && repsLow > repsHigh) {
    return { ok: false, error: "The low end of the rep range is above the high end" };
  }
  const note = input.note?.trim() ? input.note.trim().slice(0, INJURY_RULE_NOTE_MAX) : null;
  if (input.effect === "limit" && maxWeight === null && repsLow === null && note === null) {
    return { ok: false, error: "Give a max weight, a rep range or a note" };
  }
  return {
    ok: true,
    rule: {
      exerciseId,
      effect: input.effect,
      maxWeight: maxWeight === null ? null : Math.round(maxWeight * 100) / 100,
      units: maxWeight === null ? null : (input.units ?? null),
      repsLow,
      repsHigh,
      note,
    },
  };
}

/**
 * An injury row's `exerciseRules` as rules. Lenient: a row synced before the
 * column existed reads as no rules, and a malformed entry is dropped.
 */
export function parseInjuryRules(value: unknown): InjuryExerciseRule[] {
  if (!Array.isArray(value)) return [];
  const rules: InjuryExerciseRule[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    if (typeof raw.exerciseId !== "string" || typeof raw.effect !== "string") continue;
    const num = (v: unknown) => (typeof v === "number" ? v : null);
    const cleaned = cleanInjuryRule({
      exerciseId: raw.exerciseId,
      effect: raw.effect,
      maxWeight: num(raw.maxWeight),
      units: raw.units === "kg" || raw.units === "lb" ? raw.units : null,
      repsLow: num(raw.repsLow),
      repsHigh: num(raw.repsHigh),
      note: typeof raw.note === "string" ? raw.note : null,
    });
    if (cleaned.ok && !rules.some((rule) => rule.exerciseId === cleaned.rule.exerciseId)) {
      rules.push(cleaned.rule);
    }
  }
  return rules;
}

/** `rules` with `rule` in place of any rule for the same exercise. */
export function withInjuryRule(
  rules: readonly InjuryExerciseRule[],
  rule: InjuryExerciseRule,
): InjuryExerciseRule[] {
  const others = rules.filter((r) => r.exerciseId !== rule.exerciseId);
  if (others.length >= INJURY_RULES_MAX) {
    throw new Error(`An injury holds up to ${INJURY_RULES_MAX} exercise rules`);
  }
  return [...others, rule];
}

export function withoutInjuryRule(
  rules: readonly InjuryExerciseRule[],
  exerciseId: string,
): InjuryExerciseRule[] {
  return rules.filter((rule) => rule.exerciseId !== exerciseId);
}

/** Converted caps round down to this step, so 60 kg reads 132 lb, not 132.28. */
const CONVERTED_CAP_STEP: Readonly<Record<WeightUnits, number>> = { lb: 1, kg: 0.5 };

/**
 * A rule's cap in `units`, or null without one. A cap written in the other
 * units converts and rounds down, so it stays a cap.
 */
export function ruleMaxWeight(rule: InjuryExerciseRule, units: WeightUnits): number | null {
  if (rule.maxWeight === null) return null;
  if (!rule.units || rule.units === units) return rule.maxWeight;
  const converted = convertWeight(rule.maxWeight, rule.units, units);
  const step = CONVERTED_CAP_STEP[units];
  const rounded = Math.floor(converted / step + 1e-9) * step;
  return rounded > 0 ? rounded : converted;
}

/**
 * Rules moved from a merged-away exercise to the one kept (issue #497's
 * merge). A rule the kept exercise already has wins. Null when nothing
 * names `fromId`.
 */
export function repointInjuryRules(
  rules: readonly InjuryExerciseRule[],
  fromId: string,
  toId: string,
): InjuryExerciseRule[] | null {
  if (!rules.some((rule) => rule.exerciseId === fromId)) return null;
  const keepHasRule = rules.some((rule) => rule.exerciseId === toId);
  return rules.flatMap((rule) =>
    rule.exerciseId !== fromId ? [rule] : keepHasRule ? [] : [{ ...rule, exerciseId: toId }],
  );
}

function formatWeight(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** "Go light · up to 60 kg · 12–15 reps" or "Up to 60 kg", without the note. */
export function describeInjuryRule(rule: InjuryExerciseRule, units: WeightUnits): string {
  const parts: string[] = [INJURY_RULE_EFFECT_LABELS[rule.effect]];
  const cap = ruleMaxWeight(rule, units);
  if (cap !== null) parts.push(`up to ${formatWeight(cap)} ${units}`);
  if (rule.repsLow !== null && rule.repsHigh !== null) {
    parts.push(
      rule.repsLow === rule.repsHigh
        ? `${rule.repsLow} reps`
        : `${rule.repsLow}–${rule.repsHigh} reps`,
    );
  }
  // "Limit it" says nothing once the limits are listed.
  if (rule.effect === "limit" && parts.length > 1) parts.shift();
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
