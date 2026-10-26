import type { DprDecision, SessionIntensity } from "../dpr/decide";
import { roundToIncrement } from "../dpr/equipment-increments";
import { applyIntensity } from "../dpr/intensity";
import { type ExerciseCategory, isStrengthExercise } from "../warmups/category";
import { areaMuscles } from "./areas";

/**
 * How an injury bears on training (issue #627). Jim suggests and never
 * changes the workout itself; PRP treats a lift whose primary muscle is
 * hurt like a light day while the injury is open, and eases it back in on
 * its first session after the injury healed.
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

function hitsPrimaryOn(exercise: ExerciseMuscles, injuries: readonly InjuryLike[], day: string) {
  return injuries.some(
    (injury) => isInjuryOpenOn(injury, day) && injuryHit(exercise, injury.area) === "primary",
  );
}

/**
 * PRP's history with every session logged while an open injury hit the
 * lift's primary muscle marked light, so it's left out of progression the
 * way a light day is. Returns the same array when nothing changes.
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
    if (!hitsPrimaryOn(exercise, live, dayKeyOf(entry.date))) return entry;
    changed = true;
    return { ...entry, intensity: "light" as const };
  });
  return changed ? marked : history;
}

/** "light" while an injury hits the lift's primary muscle; "ease" on its first session after. */
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
  if (hitsPrimaryOn(exercise, live, today)) return "light";
  const lastHealed = live
    .filter(
      (injury) =>
        injury.healedOn !== null &&
        injury.healedOn <= today &&
        injuryHit(exercise, injury.area) === "primary",
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

/**
 * The Replace exercise filter for swapping an affected exercise (issue
 * #627): strength exercises that work one of the original's muscles the
 * injury leaves alone, as a primary muscle, and don't touch any of `areas`.
 */
export function sparingSwapFilter(
  original: ExerciseMuscles,
  areas: readonly string[],
): (candidate: ExerciseMuscles & { category?: ExerciseCategory | null }) => boolean {
  const hurt = new Set(areas.flatMap((area) => areaMuscles(area)));
  const wanted = new Set(
    [...original.primaryMuscles, ...original.secondaryMuscles].filter(
      (muscle) => !hurt.has(muscle),
    ),
  );
  return (candidate) =>
    isStrengthExercise(candidate) &&
    areas.every((area) => injuryHit(candidate, area) === null) &&
    candidate.primaryMuscles.some((muscle) => wanted.has(muscle));
}
