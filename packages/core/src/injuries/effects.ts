import type { DprDecision, RepRange, SessionIntensity } from "../dpr/decide";
import { type WeightUnits, roundToIncrement } from "../dpr/equipment-increments";
import { applyIntensity } from "../dpr/intensity";
import { type ExerciseCategory, isStrengthExercise } from "../warmups/category";
import { areaMuscles } from "./areas";
import { type InjuryExerciseRule, parseInjuryRules, ruleMaxWeight } from "./exercise-rules";
import { painSuggestion } from "./pain";

/**
 * How an injury bears on training (issue #627). Jim suggests and never
 * changes the workout itself; PRP treats a lift whose primary muscle is
 * hurt like a light day while the injury is open, and eases it back in on
 * its first session after the injury healed. An exercise rule (issue #724)
 * replaces that treatment for its one exercise.
 */

/** The fields of an injury row these helpers read; Dexie and Drizzle rows both fit. */
export interface InjuryLike {
  id: string;
  area: string;
  side: string | null;
  /** Local calendar day, YYYY-MM-DD. */
  startedOn: string;
  healedOn: string | null;
  deletedAt: Date | null;
  /** Exercise rules (issue #724), read with `parseInjuryRules`; absent on old rows. */
  exerciseRules?: unknown;
}

export interface ExerciseMuscles {
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
}

export type InjuryHit = "primary" | "secondary";

/** Open from its start day until (not including) the day it was marked healed. */
export function isInjuryOpenOn(injury: InjuryLike, day: string): boolean {
  if (injury.deletedAt) return false;
  return injury.startedOn <= day && (injury.healedOn === null || day < injury.healedOn);
}

/** Live injuries not yet healed. */
export function openInjuries<T extends InjuryLike>(injuries: readonly T[]): T[] {
  return injuries.filter((injury) => !injury.deletedAt && injury.healedOn === null);
}

/** Whether an exercise works the area's muscles, and how. */
export function injuryHit(exercise: ExerciseMuscles, area: string): InjuryHit | null {
  const muscles = areaMuscles(area);
  if (exercise.primaryMuscles.some((muscle) => muscles.includes(muscle))) return "primary";
  if (exercise.secondaryMuscles.some((muscle) => muscles.includes(muscle))) return "secondary";
  return null;
}

/** The injury open on `day` that hits an exercise hardest (primary before secondary), or null. */
export function worstInjuryHit<T extends InjuryLike>(
  exercise: ExerciseMuscles,
  injuries: readonly T[],
  day: string,
): { injury: T; hit: InjuryHit } | null {
  let worst: { injury: T; hit: InjuryHit } | null = null;
  for (const injury of injuries) {
    if (!isInjuryOpenOn(injury, day)) continue;
    const hit = injuryHit(exercise, injury.area);
    if (hit === "primary") return { injury, hit };
    if (hit && !worst) worst = { injury, hit };
  }
  return worst;
}

/** An injury's rule for one exercise, or null. */
export function injuryRuleFor(injury: InjuryLike, exerciseId: string): InjuryExerciseRule | null {
  return (
    parseInjuryRules(injury.exerciseRules).find((rule) => rule.exerciseId === exerciseId) ?? null
  );
}

/** How one open injury bears on one exercise: its muscle hit, its rule, or both. */
export interface ExerciseInjuryGuidance<T extends InjuryLike = InjuryLike> {
  injury: T;
  hit: InjuryHit | null;
  rule: InjuryExerciseRule | null;
}

function guidanceOf<T extends InjuryLike>(
  exerciseId: string,
  exercise: ExerciseMuscles,
  injury: T,
): ExerciseInjuryGuidance<T> | null {
  const rule = injuryRuleFor(injury, exerciseId);
  // "Fine as is" clears this injury for this exercise.
  if (rule?.effect === "fine") return null;
  const hit = injuryHit(exercise, injury.area);
  return rule || hit ? { injury, hit, rule } : null;
}

// How restrictive each kind of guidance is: a rule replaces only its own
// injury's treatment, so another injury's pain band can still outrank it.
const RULE_RANK = { avoid: 5, light: 4, limit: 3, fine: 0 } as const;
const PAIN_RANK = { skip: 6, swap: 4.5, light: 2.5 } as const;

function guidanceRank(guidance: ExerciseInjuryGuidance, pain: number | null): number {
  if (guidance.rule) return RULE_RANK[guidance.rule.effect];
  const suggestion = painSuggestion(pain);
  if (suggestion) return PAIN_RANK[suggestion];
  return guidance.hit === "primary" ? 2 : 1;
}

/**
 * The open injury that matters most for an exercise on `day`, by what the
 * user is told to do: skip (pain 7+), an avoid rule, swap (pain 4–6), a
 * light rule, a limit rule, light (pain 1–3), then a plain primary or
 * secondary hit. `painOf` gives an injury's pain today. Null when nothing
 * applies.
 */
export function exerciseInjuryGuidance<T extends InjuryLike>(
  exercise: ExerciseMuscles & { id: string },
  injuries: readonly T[],
  day: string,
  painOf: (injury: T) => number | null = () => null,
): ExerciseInjuryGuidance<T> | null {
  let best: { guidance: ExerciseInjuryGuidance<T>; rank: number } | null = null;
  for (const injury of injuries) {
    if (!isInjuryOpenOn(injury, day)) continue;
    const guidance = guidanceOf(exercise.id, exercise, injury);
    if (!guidance) continue;
    const rank = guidanceRank(guidance, painOf(injury));
    if (!best || rank > best.rank) best = { guidance, rank };
  }
  return best?.guidance ?? null;
}

/**
 * Whether an injury shapes a lift's progression: its rule says so (anything
 * but fine), or with no rule it hits the lift's primary muscle.
 */
function shapesLift(injury: InjuryLike, exerciseId: string, exercise: ExerciseMuscles): boolean {
  const rule = injuryRuleFor(injury, exerciseId);
  if (rule) return rule.effect !== "fine";
  return injuryHit(exercise, injury.area) === "primary";
}

function shapesLiftOn(
  exerciseId: string,
  exercise: ExerciseMuscles,
  injuries: readonly InjuryLike[],
  day: string,
): boolean {
  return injuries.some(
    (injury) => isInjuryOpenOn(injury, day) && shapesLift(injury, exerciseId, exercise),
  );
}

/**
 * PRP's history with every session logged while an open injury shaped the
 * lift (hit its primary muscle, or had a rule for it other than fine)
 * marked light, so it's left out of progression the way a light day is. Returns the same array when nothing changes.
 */
export function markInjuredHistory<
  T extends { exerciseId: string; date: Date; intensity?: SessionIntensity | null },
>(
  history: readonly T[],
  injuries: readonly InjuryLike[],
  musclesOf: (exerciseId: string) => ExerciseMuscles | undefined,
  dayKeyOf: (date: Date) => string,
): readonly T[] {
  const live = injuries.filter((injury) => !injury.deletedAt);
  if (live.length === 0) return history;
  let changed = false;
  const marked = history.map((entry) => {
    const exercise = musclesOf(entry.exerciseId);
    if (!exercise || entry.intensity === "light") return entry;
    if (!shapesLiftOn(entry.exerciseId, exercise, live, dayKeyOf(entry.date))) return entry;
    changed = true;
    return { ...entry, intensity: "light" as const };
  });
  return changed ? marked : history;
}

/**
 * "light" while an injury hits the lift's primary muscle or has a light or
 * avoid rule for it; "ease" on its first session after the injury healed.
 */
export type InjuryPrpEffect = "light" | "ease";

export function injuryPrpEffect(input: {
  exerciseId: string;
  exercise: ExerciseMuscles | undefined;
  injuries: readonly InjuryLike[];
  /** Completed sessions, any order. */
  history: readonly { exerciseId: string; date: Date }[];
  today: string;
  dayKeyOf: (date: Date) => string;
}): InjuryPrpEffect | null {
  const { exercise, today } = input;
  if (!exercise) return null;
  const live = input.injuries.filter((injury) => !injury.deletedAt);
  const open = live.filter(
    (injury) => isInjuryOpenOn(injury, today) && shapesLift(injury, input.exerciseId, exercise),
  );
  // A limit rule caps the lift (see injuryLimit) without making it a light day.
  if (open.some((injury) => injuryRuleFor(injury, input.exerciseId)?.effect !== "limit")) {
    return "light";
  }
  if (open.length > 0) return null;
  const lastHealed = live
    .filter(
      (injury) =>
        injury.healedOn !== null &&
        injury.healedOn <= today &&
        shapesLift(injury, input.exerciseId, exercise),
    )
    .map((injury) => injury.healedOn as string)
    .sort()
    .at(-1);
  if (!lastHealed) return null;
  const doneSince = input.history.some(
    (entry) => entry.exerciseId === input.exerciseId && input.dayKeyOf(entry.date) >= lastHealed,
  );
  return doneSince ? null : "ease";
}

/** Easing a lift back in after an injury takes this off its last weight. */
export const INJURY_EASE_PCT = 0.05;

function formatWeight(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * PRP's call for one lift with an injury effect applied. A light effect
 * backs the weight off like a light day; ease turns the call into EASE ↘
 * unless a layoff already eases it in, or there's no weight to ease from.
 */
export function applyInjuryEffect(
  decision: DprDecision,
  effect: InjuryPrpEffect | null | undefined,
  increment: number,
): DprDecision {
  // Already a light day (the session's own pick): never back off twice.
  if (!effect || decision.call === "light") return decision;
  if (effect === "light") {
    const light = applyIntensity(decision, "light", increment);
    if (light.call !== "light") return light;
    const from = light.previousWeight;
    return {
      ...light,
      reason: `Injury — light day, ${formatWeight(light.weight ?? 0)} instead of ${formatWeight(
        Math.min(...[decision.weight, from].filter((w): w is number => w !== null)),
      )}`,
    };
  }
  if (decision.call === "reenter" || decision.previousWeight === null) return decision;
  return {
    ...decision,
    call: "reenter",
    weight: roundToIncrement(decision.previousWeight * (1 - INJURY_EASE_PCT), increment, "down"),
    reason: `Back from injury — easing back in ${Math.round(INJURY_EASE_PCT * 100)}%`,
    streak: 0,
  };
}

/** The weight cap and rep range open injuries' rules put on one lift (issue #724). */
export interface InjuryLimit {
  /** In the user's units. */
  maxWeight: number | null;
  reps: RepRange | null;
}

/**
 * The tightest cap and rep range among the limit and light rules of the
 * injuries open `today` for this exercise, or null without any. Rep ranges
 * that don't overlap keep the first injury's.
 */
export function injuryLimit(input: {
  exerciseId: string;
  injuries: readonly InjuryLike[];
  today: string;
  units: WeightUnits;
}): InjuryLimit | null {
  let maxWeight: number | null = null;
  let reps: RepRange | null = null;
  for (const injury of input.injuries) {
    if (!isInjuryOpenOn(injury, input.today)) continue;
    const rule = injuryRuleFor(injury, input.exerciseId);
    if (!rule || (rule.effect !== "limit" && rule.effect !== "light")) continue;
    const cap = ruleMaxWeight(rule, input.units);
    if (cap !== null) maxWeight = maxWeight === null ? cap : Math.min(maxWeight, cap);
    if (rule.repsLow !== null && rule.repsHigh !== null) {
      const next = { low: rule.repsLow, high: rule.repsHigh };
      if (!reps) reps = next;
      else {
        const low = Math.max(reps.low, next.low);
        const high = Math.min(reps.high, next.high);
        if (low <= high) reps = { low, high };
      }
    }
  }
  return maxWeight === null && reps === null ? null : { maxWeight, reps };
}

/**
 * PRP's call with an injury limit applied: the weight held under the cap,
 * and the target reps moved into the range. A deload or light call under
 * the cap already stays as it is.
 */
export function applyInjuryLimit(
  decision: DprDecision,
  limit: InjuryLimit | null | undefined,
  increment: number,
): DprDecision {
  if (!limit) return decision;
  let next = decision;
  // A cap under one step can't round down to anything loadable: hold the cap itself.
  const rounded =
    limit.maxWeight === null ? null : roundToIncrement(limit.maxWeight, increment, "down");
  const cap = rounded !== null && rounded <= 0 ? limit.maxWeight : rounded;
  if (cap !== null && next.weight !== null && next.weight > cap) {
    next = {
      ...next,
      call: next.call === "light" || next.call === "deload" ? next.call : "hold",
      weight: cap,
      reason: `Injury rule — capped at ${formatWeight(cap)}`,
      streak: next.call === "light" || next.call === "deload" ? next.streak : 0,
    };
  }
  if (limit.reps && next.targetReps !== null) {
    const targetReps = Math.min(limit.reps.high, Math.max(limit.reps.low, next.targetReps));
    if (targetReps !== next.targetReps) next = { ...next, targetReps };
  }
  return next;
}

/**
 * The Replace exercise filter for swapping an affected exercise (issue
 * #627): strength exercises that work one of the original's muscles the
 * injury leaves alone, as a primary muscle, and don't touch any of `areas`
 * or have an avoid rule (issue #724), listed in `avoidIds`.
 */
export function sparingSwapFilter(
  original: ExerciseMuscles,
  areas: readonly string[],
  avoidIds: readonly string[] = [],
): (candidate: ExerciseMuscles & { id?: string; category?: ExerciseCategory | null }) => boolean {
  const hurt = new Set(areas.flatMap((area) => areaMuscles(area)));
  const wanted = new Set(
    [...original.primaryMuscles, ...original.secondaryMuscles].filter(
      (muscle) => !hurt.has(muscle),
    ),
  );
  return (candidate) =>
    isStrengthExercise(candidate) &&
    !(candidate.id !== undefined && avoidIds.includes(candidate.id)) &&
    areas.every((area) => injuryHit(candidate, area) === null) &&
    candidate.primaryMuscles.some((muscle) => wanted.has(muscle));
}
