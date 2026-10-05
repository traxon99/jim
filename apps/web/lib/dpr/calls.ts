import type {
  DprBlockLiftRow,
  DprBlockRow,
  ExerciseRow,
  RoutineExerciseRow,
  SettingsRow,
} from "@/lib/db/schema";
import { ruleOf } from "@/lib/progression/calls";
import {
  type DprCall,
  type DprDecision,
  type DprLiftCall,
  type DprLogEntry,
  type DprUserSettings,
  type IncrementOverrides,
  type OnTrackStatus,
  type SessionIntensity,
  callForLift,
  liftProgress,
  progressionSystemFor,
  workingSetWeights,
} from "@jim/core";
import { currentBlock, liveBlockLifts } from "./block";
import { type DprSnapshot, defaultRepRange } from "./data";

/**
 * Everything needed to make DPR calls for any lift, gathered once per
 * screen. Null (from `useDprContext`) means no DPR UI at all: DPR is off,
 * no block is running, or the data is still loading.
 */
export interface DprContext {
  snapshot: DprSnapshot;
  settings: SettingsRow;
  block: DprBlockRow;
  /** Focused lifts, by exercise id. */
  lifts: ReadonlyMap<string, DprBlockLiftRow>;
  exercises: ReadonlyMap<string, ExerciseRow>;
  now: Date;
}

/** Null — no DPR UI — when DPR is off or no block is running. */
export function buildDprContext(input: {
  settings: SettingsRow;
  blocks: readonly DprBlockRow[];
  lifts: readonly DprBlockLiftRow[];
  exercises: readonly ExerciseRow[];
  snapshot: DprSnapshot;
  now: Date;
}): DprContext | null {
  if (!input.settings.dprEnabled) return null;
  const block = currentBlock(input.blocks);
  if (!block) return null;
  return {
    snapshot: input.snapshot,
    settings: input.settings,
    block,
    lifts: new Map(liveBlockLifts(input.lifts, block.id).map((lift) => [lift.exerciseId, lift])),
    exercises: new Map(input.exercises.map((exercise) => [exercise.id, exercise])),
    now: input.now,
  };
}

export type DprCallInfo = DprLiftCall;

type RoutineTarget = Pick<RoutineExerciseRow, "targetRepsLow" | "targetRepsHigh" | "targetWeight"> &
  Partial<Pick<RoutineExerciseRow, "progressionRule">>;

export function dprUserSettings(settings: SettingsRow): DprUserSettings {
  return {
    units: settings.units,
    aggressiveness: settings.dprAggressiveness,
    increments: settings.dprEquipmentIncrements as IncrementOverrides,
    defaultRange: defaultRepRange(settings),
  };
}

/**
 * DPR's call for one lift, or null when the lift isn't focused — or when
 * the routine gives it a custom progression rule, which wins (issue #255,
 * ADR-016: one automatic system per lift).
 */
export function dprCallFor(
  ctx: DprContext,
  exerciseId: string,
  target?: RoutineTarget | null,
  /** The session's "how hard today?" pick (issue #235). */
  intensity?: SessionIntensity | null,
): DprCallInfo | null {
  if (!ctx.lifts.has(exerciseId)) return null;
  const system = progressionSystemFor({ rule: ruleOf(target), dprFocused: true });
  if (system !== "dpr") return null;
  const fallback = target?.targetWeight == null ? null : Number(target.targetWeight);
  return callForLift({
    snapshot: ctx.snapshot,
    exerciseId,
    equipment: ctx.exercises.get(exerciseId)?.equipment,
    settings: dprUserSettings(ctx.settings),
    target: target ?? null,
    fallbackWeight: Number.isFinite(fallback) ? fallback : null,
    block: ctx.block,
    intensity,
    now: ctx.now,
  });
}

/** Calls for every focused lift in a routine, in routine order. */
export function dprCallsForRoutine(
  ctx: DprContext,
  items: readonly (RoutineTarget & {
    exerciseId: string;
    position: number;
    deletedAt: Date | null;
  })[],
  intensity?: SessionIntensity | null,
): DprCallInfo[] {
  return [...items]
    .filter((item) => !item.deletedAt)
    .sort((a, b) => a.position - b.position)
    .map((item) => dprCallFor(ctx, item.exerciseId, item, intensity))
    .filter((info): info is DprCallInfo => info !== null);
}

export interface DprBadge {
  symbol: string;
  label: string;
  /** Tailwind classes for the pill. */
  className: string;
}

const BADGES: Record<DprCall, DprBadge> = {
  increase: {
    symbol: "↑",
    label: "DPR: increase",
    className: "border-green-600 text-green-700 dark:border-green-500 dark:text-green-400",
  },
  hold: {
    symbol: "=",
    label: "DPR: hold",
    className: "border-zinc-400 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400",
  },
  deload: {
    symbol: "↓",
    label: "DPR: deload",
    className: "border-orange-600 text-orange-700 dark:border-orange-500 dark:text-orange-400",
  },
  reenter: {
    symbol: "↓",
    label: "DPR: easing back in",
    className: "border-orange-600 text-orange-700 dark:border-orange-500 dark:text-orange-400",
  },
  light: {
    symbol: "↓",
    label: "DPR: light day",
    className: "border-sky-600 text-sky-700 dark:border-sky-500 dark:text-sky-400",
  },
  insufficient: {
    symbol: "?",
    label: "DPR: needs RPE",
    className: "border-zinc-400 text-zinc-500 dark:border-zinc-600 dark:text-zinc-500",
  },
};

export function dprBadge(call: DprCall): DprBadge {
  return BADGES[call];
}

function formatWeight(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * The in-session "why" line, e.g. "DPR: hit 3×8 @ RPE 7.5 last time → +5 lb"
 * or "DPR: 18 days off — easing back in 5% → 175 lb".
 */
export function dprWhyLine(decision: DprDecision, units: string): string {
  const { call, weight, previousWeight, reason } = decision;
  switch (call) {
    case "increase": {
      const delta = weight !== null && previousWeight !== null ? weight - previousWeight : null;
      return `DPR: ${lowerFirst(reason)} last time${delta ? ` → +${formatWeight(delta)} ${units}` : ""}`;
    }
    case "deload":
    case "reenter":
      return `DPR: ${lowerFirst(reason)}${weight === null ? "" : ` → ${formatWeight(weight)} ${units}`}`;
    case "hold":
    case "light":
      return `DPR: ${lowerFirst(reason)}`;
    case "insufficient":
      return reason === "Add RPE for DPR"
        ? "DPR: add RPE to your working sets so DPR can make a call"
        : "DPR: log this lift with RPE to get a call next time";
  }
}

/**
 * The weight placeholder for a not-yet-logged row: DPR's weight for working
 * sets of a focused lift, else null (use the usual "last time" suggestion).
 * Given the row's place among `count` working sets, the sets ramp up to
 * DPR's weight as the top set (issue #385); a set past the plan, or no
 * place given, gets the top weight.
 */
export function dprWeightPlaceholder(
  info: DprCallInfo | null,
  kind: string,
  set?: { ordinal: number; count: number },
): string | null {
  if (!info || kind !== "working" || info.decision.weight === null) return null;
  const ramp = set ? workingSetWeights(info.decision, set.count, info.increment) : [];
  return formatWeight(ramp[set?.ordinal ?? -1] ?? info.decision.weight);
}

/** After any weight change, aim for the bottom of the range; else null ("last time" reps). */
export function dprRepsPlaceholder(info: DprCallInfo | null, kind: string): string | null {
  if (!info || kind !== "working" || info.decision.targetReps === null) return null;
  return String(info.decision.targetReps);
}

/** A logged working set of a focused lift with no RPE doesn't count toward DPR. */
export function needsRpeNudge(
  focused: boolean,
  set: { kind: string; rpe: string | number | null },
): boolean {
  return focused && set.kind === "working" && (set.rpe === null || set.rpe === "");
}

export interface DprGoalLine {
  status: OnTrackStatus | null;
  text: string;
}

const STATUS_TEXT: Record<OnTrackStatus, string> = {
  ahead: "ahead",
  on_track: "on track",
  behind: "behind",
};

/** e.g. "on track · e1RM 231 → 245 by Dec 19". */
export function dprGoalLine(ctx: DprContext, exerciseId: string): DprGoalLine | null {
  const lift = ctx.lifts.get(exerciseId);
  if (!lift) return null;
  const goal = liftGoal(lift);
  const by = ctx.block.endsAt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (goal.baselineE1rm === null || goal.goalE1rm === null) {
    return { status: null, text: `Goal set after your first session with RPE · block ends ${by}` };
  }
  const { currentE1rm, status } = liftProgress(ctx.snapshot, exerciseId, ctx.block, goal, ctx.now);
  return {
    status,
    text: `${status ? STATUS_TEXT[status] : "no data yet"} · e1RM ${Math.round(currentE1rm ?? goal.baselineE1rm)} → ${Math.round(goal.goalE1rm)} by ${by}`,
  };
}

export function liftGoal(lift: DprBlockLiftRow): {
  baselineE1rm: number | null;
  goalE1rm: number | null;
} {
  return {
    baselineE1rm: lift.baselineE1rm === null ? null : Number(lift.baselineE1rm),
    goalE1rm: lift.goalE1rm === null ? null : Number(lift.goalE1rm),
  };
}

/**
 * A routine's calls folded into one badge's text (issue #284), e.g.
 * "↑2 =1" — each call's symbol with its count, most common first; ties keep
 * the order the calls first appear in.
 */
export function dprCallSummary(calls: readonly DprCallInfo[]): string {
  const counts = new Map<string, number>();
  for (const { decision } of calls) {
    const { symbol } = BADGES[decision.call];
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([symbol, count]) => `${symbol}${count}`)
    .join(" ");
}

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A decision-log line, e.g. "Sep 12 · ↑ 185→190 · 3×8 @ RPE 7.5". */
export function formatLogEntry(entry: DprLogEntry): string {
  const { decision } = entry;
  const { symbol } = dprBadge(decision.call);
  const from = decision.previousWeight;
  const to = decision.weight;
  const move =
    from !== null && to !== null && from !== to
      ? `${formatWeight(from)}→${formatWeight(to)}`
      : to !== null
        ? formatWeight(to)
        : "—";
  const reason = decision.reason.replace(/^Hit /, "");
  return `${shortDate(entry.sessionDate)} · ${symbol} ${move} · ${reason}`;
}
