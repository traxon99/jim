import type {
  DprBlockLiftRow,
  DprBlockRow,
  ExerciseRow,
  RoutineExerciseRow,
  SettingsRow,
} from "@/lib/db/schema";
import {
  DPR_PRESETS,
  type DprCall,
  type DprDecision,
  type E1rmPoint,
  type IncrementOverrides,
  type OnTrackStatus,
  type RepRange,
  decideNextWeight,
  onTrackStatus,
  resolveIncrement,
  resolveRepRange,
  sessionsForKey,
} from "@jim/core";
import { currentBlock, liveBlockLifts } from "./block";
import { type DprSnapshot, defaultRepRange, e1rmSeries } from "./data";

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

export interface DprCallInfo {
  exerciseId: string;
  decision: DprDecision;
  repRange: RepRange;
  increment: number;
}

type RoutineTarget = Pick<RoutineExerciseRow, "targetRepsLow" | "targetRepsHigh" | "targetWeight">;

/** DPR's call for one lift, or null when the lift isn't focused. */
export function dprCallFor(
  ctx: DprContext,
  exerciseId: string,
  target?: RoutineTarget | null,
): DprCallInfo | null {
  if (!ctx.lifts.has(exerciseId)) return null;
  const repRange = resolveRepRange(
    exerciseId,
    target ?? null,
    ctx.snapshot.routineRanges,
    defaultRepRange(ctx.settings),
  );
  const increment = resolveIncrement(
    ctx.exercises.get(exerciseId)?.equipment,
    ctx.settings.units,
    ctx.settings.dprEquipmentIncrements as IncrementOverrides,
  );
  const fallback = target?.targetWeight == null ? null : Number(target.targetWeight);
  const decision = decideNextWeight({
    sessions: sessionsForKey(ctx.snapshot.history, exerciseId, repRange),
    repRange,
    preset: DPR_PRESETS[ctx.settings.dprAggressiveness],
    increment,
    now: ctx.now,
    fallbackWeight: Number.isFinite(fallback) ? fallback : null,
  });
  return { exerciseId, decision, repRange, increment };
}

/** Calls for every focused lift in a routine, in routine order. */
export function dprCallsForRoutine(
  ctx: DprContext,
  items: readonly (RoutineTarget & {
    exerciseId: string;
    position: number;
    deletedAt: Date | null;
  })[],
): DprCallInfo[] {
  return [...items]
    .filter((item) => !item.deletedAt)
    .sort((a, b) => a.position - b.position)
    .map((item) => dprCallFor(ctx, item.exerciseId, item))
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
      return `DPR: ${lowerFirst(reason)}`;
    case "insufficient":
      return reason === "Add RPE for DPR"
        ? "DPR: add RPE to your working sets so DPR can make a call"
        : "DPR: log this lift with RPE to get a call next time";
  }
}

/** Compact chip text for the Workout tab, e.g. "Bench ↑ 190" or "OHP ? add RPE". */
export function dprChipText(name: string, decision: DprDecision): string {
  const { symbol } = dprBadge(decision.call);
  if (decision.call === "insufficient" || decision.weight === null) return `${name} ? add RPE`;
  return `${name} ${symbol} ${formatWeight(decision.weight)}`;
}

/**
 * The weight placeholder for a not-yet-logged row: DPR's weight for working
 * sets of a focused lift, else null (use the usual "last time" suggestion).
 */
export function dprWeightPlaceholder(info: DprCallInfo | null, kind: string): string | null {
  if (!info || kind !== "working" || info.decision.weight === null) return null;
  return formatWeight(info.decision.weight);
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
  const baseline = lift.baselineE1rm === null ? null : Number(lift.baselineE1rm);
  const goal = lift.goalE1rm === null ? null : Number(lift.goalE1rm);
  const by = ctx.block.endsAt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (baseline === null || goal === null) {
    return { status: null, text: `Goal set after your first session with RPE · block ends ${by}` };
  }
  const series: E1rmPoint[] = e1rmSeries(ctx.snapshot.history, exerciseId);
  const status = onTrackStatus(
    {
      startDate: ctx.block.startedAt,
      weeks: ctx.block.weeks,
      baselineE1rm: baseline,
      goalE1rm: goal,
    },
    series,
    ctx.now,
  );
  const latest = series.filter((p) => p.date >= ctx.block.startedAt).at(-1)?.e1rm ?? baseline;
  return {
    status,
    text: `${STATUS_TEXT[status]} · e1RM ${Math.round(latest)} → ${Math.round(goal)} by ${by}`,
  };
}

/** Chips that fit on one line: the first `max`, then "+N more". */
export function splitChips<T>(items: readonly T[], max: number): { shown: T[]; more: number } {
  if (items.length <= max) return { shown: [...items], more: 0 };
  return { shown: items.slice(0, max), more: items.length - max };
}
