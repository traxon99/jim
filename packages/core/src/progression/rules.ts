import type { DprDecision, DprSession } from "../dpr/decide";
import { roundToIncrement } from "../dpr/equipment-increments";

/**
 * Custom progression rules per routine exercise (issue #255): structured
 * options rather than a scripting language, enough for GZCLP, linear
 * programs and double progression. Like DPR, a rule's call is a pure
 * function of the logged history: only the rule itself is stored (on the
 * routine exercise), and the state it implies (current weight, rep scheme,
 * failures in a row) is replayed from sets on demand. A lift runs either
 * its custom rule or DPR, never both (ADR-016, see `progressionSystemFor`).
 */

export const PROGRESSION_TYPES = ["linear", "double", "reps_sum"] as const;
export type ProgressionType = (typeof PROGRESSION_TYPES)[number];

export interface RepScheme {
  sets: number;
  reps: number;
}

export interface DeloadRule {
  /** Failed sessions in a row (at the last rep scheme, with stages) before dropping. */
  afterFailures: number;
  /** Fraction to drop the weight by, e.g. 0.15 for 15%. */
  pct: number;
}

export interface ProgressionRule {
  /**
   * - `linear`: hit the target reps on every set → add `increment`.
   * - `double`: work up to the top of the routine's rep range on every set,
   *   then add `increment` and start again at the bottom.
   * - `reps_sum`: add `increment` once the working sets' reps add up to
   *   `repsSumTarget` (e.g. 3×15 with an AMRAP last set to 25 → 55).
   */
  type: ProgressionType;
  /** Weight added after a successful session, in the user's units. */
  increment: number;
  /**
   * Linear only: rep schemes to step through on a failed session, keeping
   * the weight (GZCLP's 5×3 → 6×2 → 10×1). Failing the last one counts
   * toward the deload, which also returns to the first scheme. Without
   * stages the routine's sets and reps are the target.
   */
  stages?: RepScheme[] | null;
  /** reps_sum only: total reps needed to go up; default sets × top of the range. */
  repsSumTarget?: number | null;
  deload?: DeloadRule | null;
}

export const PROGRESSION_TYPE_LABELS: Record<ProgressionType, string> = {
  linear: "Linear",
  double: "Double progression",
  reps_sum: "Reps sum",
};

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function positiveInt(value: unknown): number | null {
  const n = positiveNumber(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

/**
 * The rule stored on a routine exercise, or null when there's none or it
 * doesn't parse. Rows come from Dexie, Postgres jsonb and MCP input alike,
 * so this never trusts the shape.
 */
export function parseProgressionRule(value: unknown): ProgressionRule | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!PROGRESSION_TYPES.includes(raw.type as ProgressionType)) return null;
  const increment = positiveNumber(raw.increment);
  if (increment === null) return null;
  const type = raw.type as ProgressionType;

  let stages: RepScheme[] | null = null;
  if (type === "linear" && Array.isArray(raw.stages) && raw.stages.length > 0) {
    stages = [];
    for (const stage of raw.stages) {
      const sets = positiveInt((stage as Record<string, unknown> | null)?.sets);
      const reps = positiveInt((stage as Record<string, unknown> | null)?.reps);
      if (sets === null || reps === null) return null;
      stages.push({ sets, reps });
    }
  }

  let deload: DeloadRule | null = null;
  if (raw.deload && typeof raw.deload === "object") {
    const d = raw.deload as Record<string, unknown>;
    const afterFailures = positiveInt(d.afterFailures);
    const pct = positiveNumber(d.pct);
    if (afterFailures === null || pct === null || pct >= 1) return null;
    deload = { afterFailures, pct };
  }

  const repsSumTarget = type === "reps_sum" ? positiveInt(raw.repsSumTarget) : null;
  return { type, increment, stages, repsSumTarget, deload };
}

/** The automatic system running a lift: a custom rule always beats DPR focus. */
export type ProgressionSystem = "custom" | "dpr" | "none";

/**
 * ADR-016 allows one automatic progression per lift. A lift with a custom
 * rule runs that rule even if it's also DPR-focused (e.g. two devices made
 * the edits offline); the editors refuse to create that state up front.
 */
export function progressionSystemFor(input: {
  rule: ProgressionRule | null;
  dprFocused: boolean;
}): ProgressionSystem {
  if (input.rule) return "custom";
  return input.dprFocused ? "dpr" : "none";
}

/** Why a rule can't be set on a lift, or null when it can. */
export function customRuleConflict(input: { dprFocused: boolean }): string | null {
  return input.dprFocused
    ? "This lift is focused in your PRP block. Remove it from PRP first, so only one system sets its weight."
    : null;
}

export interface RoutineTargets {
  targetSets: number | null;
  targetRepsLow: number | null;
  targetRepsHigh: number | null;
}

export interface ProgressionDecision extends DprDecision {
  /** Sets to do next session: the current stage's, else the routine's. */
  targetSets: number | null;
  /** Index into the rule's stages (0 without stages). */
  stage: number;
}

export interface ProgressionInput {
  rule: ProgressionRule;
  /** This exercise's history, any order. */
  sessions: readonly DprSession[];
  target: RoutineTargets;
  /** Used when there is no history, e.g. the routine's `targetWeight`. */
  fallbackWeight?: number | null;
  /** What the equipment loads in, for rounding a deload; default the rule's increment. */
  loadStep?: number | null;
}

interface SessionResult {
  topWeight: number;
  reps: number[];
}

/** The working sets at the session's top weight; null with nothing to judge. */
function summarize(session: DprSession): SessionResult | null {
  const sets = session.sets.filter(
    (set) =>
      set.kind === "working" &&
      set.weight !== null &&
      set.reps !== null &&
      set.weight > 0 &&
      set.reps > 0,
  );
  if (sets.length === 0) return null;
  const topWeight = Math.max(...sets.map((set) => set.weight as number));
  return {
    topWeight,
    reps: sets.filter((set) => set.weight === topWeight).map((set) => set.reps as number),
  };
}

interface Range {
  low: number;
  high: number;
}

function rangeOf(target: RoutineTargets): Range | null {
  const low = target.targetRepsLow ?? target.targetRepsHigh;
  const high = target.targetRepsHigh ?? target.targetRepsLow;
  if (low == null || high == null || low <= 0 || high <= 0) return null;
  return { low: Math.min(low, high), high: Math.max(low, high) };
}

/** The scheme a linear rule asks for at `stage`: the stage's, else the routine's. */
function linearScheme(
  rule: ProgressionRule,
  stage: number,
  target: RoutineTargets,
): { sets: number | null; reps: number | null } {
  const fromStage = rule.stages?.[stage];
  if (fromStage) return fromStage;
  return { sets: target.targetSets, reps: rangeOf(target)?.low ?? null };
}

type Outcome = "success" | "fail" | "progress";

function judge(
  rule: ProgressionRule,
  stage: number,
  target: RoutineTargets,
  result: SessionResult,
): Outcome {
  const range = rangeOf(target);
  const enoughSets = (sets: number | null) => sets === null || result.reps.length >= sets;
  switch (rule.type) {
    case "linear": {
      const { sets, reps } = linearScheme(rule, stage, target);
      if (reps === null) return "progress";
      return enoughSets(sets) && result.reps.every((r) => r >= reps) ? "success" : "fail";
    }
    case "double": {
      if (!range) return "progress";
      if (enoughSets(target.targetSets) && result.reps.every((r) => r >= range.high)) {
        return "success";
      }
      return result.reps.some((r) => r < range.low) ? "fail" : "progress";
    }
    case "reps_sum": {
      const total = result.reps.reduce((sum, r) => sum + r, 0);
      const sets = target.targetSets ?? result.reps.length;
      const goal = rule.repsSumTarget ?? (range ? sets * range.high : null);
      if (goal !== null && total >= goal) return "success";
      return range && total < sets * range.low ? "fail" : "progress";
    }
  }
}

function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function describe(result: SessionResult): string {
  const { reps } = result;
  const text = reps.every((r) => r === reps[0]) ? `${reps.length}×${reps[0]}` : reps.join("/");
  return `${text} @ ${formatNumber(result.topWeight)}`;
}

function schemeText(scheme: { sets: number | null; reps: number | null }): string {
  return `${scheme.sets ?? "?"}×${scheme.reps ?? "?"}`;
}

/**
 * The next session's weight and rep target under a custom rule. History is
 * replayed oldest first: each session is judged against what the rule
 * asked for at the time, and a weight other than the one asked for (an
 * override, or the first session) becomes the new starting point, so the
 * rule always builds on what was actually lifted.
 */
export function decideProgression(input: ProgressionInput): ProgressionDecision {
  const { rule, target } = input;
  const range = rangeOf(target);
  const loadStep = input.loadStep && input.loadStep > 0 ? input.loadStep : rule.increment;
  const results = [...input.sessions]
    .filter((s) => s.intensity !== "light")
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map(summarize)
    .filter((r): r is SessionResult => r !== null);

  const bottomReps = (stage: number) =>
    rule.type === "linear" ? linearScheme(rule, stage, target).reps : (range?.low ?? null);
  const setsFor = (stage: number) =>
    rule.type === "linear" ? linearScheme(rule, stage, target).sets : target.targetSets;

  if (results.length === 0) {
    const fallback = input.fallbackWeight ?? null;
    return {
      call: "insufficient",
      weight: fallback,
      previousWeight: null,
      targetReps: bottomReps(0),
      targetSets: setsFor(0),
      stage: 0,
      reason: "No history yet",
      streak: 0,
    };
  }

  let weight = 0;
  let stage = 0;
  let failures = 0;
  let decision: ProgressionDecision | null = null;
  for (const result of results) {
    if (decision === null || result.topWeight !== weight) {
      weight = result.topWeight;
      failures = 0;
    }
    const scheme = linearScheme(rule, stage, target);
    const outcome = judge(rule, stage, target, result);
    const lifted = weight;

    if (outcome === "success") {
      failures = 0;
      weight = roundToIncrement(weight + rule.increment, Math.min(loadStep, rule.increment));
      decision = {
        call: "increase",
        weight,
        previousWeight: lifted,
        targetReps: bottomReps(stage),
        targetSets: setsFor(stage),
        stage,
        reason: `Hit ${describe(result)}`,
        streak: 1,
      };
      continue;
    }

    if (outcome === "progress") {
      failures = 0;
      const nextReps =
        rule.type === "double" && range
          ? Math.min(range.high, Math.min(...result.reps) + 1)
          : bottomReps(stage);
      decision = {
        call: "hold",
        weight,
        previousWeight: lifted,
        targetReps: nextReps,
        targetSets: setsFor(stage),
        stage,
        reason:
          rule.type === "double" && range
            ? `${describe(result)} — aim for ${nextReps} reps`
            : `${describe(result)} — holding`,
        streak: 0,
      };
      continue;
    }

    // A failed session: step to the next rep scheme first, if there is one.
    const stages = rule.type === "linear" ? (rule.stages ?? []) : [];
    if (stage < stages.length - 1) {
      stage++;
      decision = {
        call: "hold",
        weight,
        previousWeight: lifted,
        targetReps: bottomReps(stage),
        targetSets: setsFor(stage),
        stage,
        reason: `Missed ${schemeText(scheme)} — moving to ${schemeText(linearScheme(rule, stage, target))}`,
        streak: 0,
      };
      continue;
    }

    failures++;
    if (rule.deload && failures >= rule.deload.afterFailures) {
      weight = roundToIncrement(weight * (1 - rule.deload.pct), loadStep, "down");
      stage = 0;
      const missed = failures;
      failures = 0;
      decision = {
        call: "deload",
        weight,
        previousWeight: lifted,
        targetReps: bottomReps(0),
        targetSets: setsFor(0),
        stage: 0,
        reason: `Missed ${missed} in a row — deload ${Math.round(rule.deload.pct * 100)}%${
          stages.length > 1 ? `, back to ${schemeText(linearScheme(rule, 0, target))}` : ""
        }`,
        streak: missed,
      };
      continue;
    }

    decision = {
      call: "hold",
      weight,
      previousWeight: lifted,
      targetReps: bottomReps(stage),
      targetSets: setsFor(stage),
      stage,
      reason: rule.deload
        ? `Missed ${describe(result)} — holding (${failures}/${rule.deload.afterFailures})`
        : `Missed ${describe(result)} — holding`,
      streak: failures,
    };
  }
  return decision as ProgressionDecision;
}
