import type { ExerciseRow, RoutineExerciseRow, SettingsRow } from "@/lib/db/schema";
import {
  type DprCall,
  type DprSnapshot,
  type IncrementOverrides,
  PROGRESSION_TYPE_LABELS,
  type ProgressionLiftCall,
  parseProgressionRule,
  progressionCallForLift,
  resolveIncrement,
} from "@jim/core";

/**
 * Custom progression rules (issue #255) in a workout: the call for a
 * routine exercise that has one. A lift with a rule never gets a DPR call
 * (`dprCallFor` returns null for it), so one system sets each weight.
 */

export type RuleCallInfo = ProgressionLiftCall;

type RuleTarget = Pick<
  RoutineExerciseRow,
  "targetSets" | "targetRepsLow" | "targetRepsHigh" | "targetWeight" | "progressionRule"
>;

/** The routine exercise's rule, or null when it has none (or it doesn't parse). */
export function ruleOf(
  target: Partial<Pick<RoutineExerciseRow, "progressionRule">> | null | undefined,
) {
  return parseProgressionRule(target?.progressionRule ?? null);
}

export function ruleCallFor(input: {
  snapshot: Pick<DprSnapshot, "history">;
  exerciseId: string;
  target: RuleTarget | null | undefined;
  exercise: Pick<ExerciseRow, "equipment"> | undefined;
  settings: Pick<SettingsRow, "units" | "dprEquipmentIncrements">;
}): RuleCallInfo | null {
  const rule = ruleOf(input.target);
  if (!rule || !input.target) return null;
  const fallback = input.target.targetWeight == null ? null : Number(input.target.targetWeight);
  return progressionCallForLift({
    snapshot: input.snapshot,
    exerciseId: input.exerciseId,
    rule,
    target: input.target,
    fallbackWeight: Number.isFinite(fallback) ? fallback : null,
    loadStep: resolveIncrement(
      input.exercise?.equipment,
      input.settings.units,
      input.settings.dprEquipmentIncrements as IncrementOverrides,
    ),
  });
}

function formatWeight(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** The rule's weight as a working set's placeholder, else null. */
export function ruleWeightPlaceholder(info: RuleCallInfo | null, kind: string): string | null {
  if (!info || kind !== "working" || info.decision.weight === null) return null;
  return formatWeight(info.decision.weight);
}

/** The rule's rep target as a working set's placeholder, else null. */
export function ruleRepsPlaceholder(info: RuleCallInfo | null, kind: string): string | null {
  if (!info || kind !== "working" || info.decision.targetReps === null) return null;
  return String(info.decision.targetReps);
}

const SYMBOLS: Record<DprCall, string> = {
  increase: "↑",
  hold: "=",
  deload: "↓",
  reenter: "↓",
  light: "↓",
  insufficient: "·",
};

/** The pill next to the exercise name, e.g. "Linear ↑". */
export function ruleBadge(info: RuleCallInfo): string {
  const label = info.rule.type === "double" ? "Double" : PROGRESSION_TYPE_LABELS[info.rule.type];
  return `${label} ${SYMBOLS[info.decision.call]}`;
}

/** The in-session "why" line, e.g. "Hit 5×3 @ 200 last time → 5×3 @ 210 lb". */
export function ruleWhyLine(info: RuleCallInfo, units: string): string {
  const { decision } = info;
  const plan =
    decision.targetSets != null && decision.targetReps != null
      ? `${decision.targetSets}×${decision.targetReps}`
      : decision.targetReps != null
        ? `${decision.targetReps} reps`
        : null;
  const at = decision.weight === null ? null : `${formatWeight(decision.weight)} ${units}`;
  const next = [plan, at].filter(Boolean).join(" @ ");
  if (decision.call === "insufficient") return next ? `Start at ${next}` : decision.reason;
  return next ? `${decision.reason} → ${next}` : decision.reason;
}
