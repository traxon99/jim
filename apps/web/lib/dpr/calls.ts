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
  type MuscleVolumePlan,
  type OnTrackStatus,
  type SessionIntensity,
  callForLift,
  liftProgress,
  mesocycleVolumePlan,
  progressionSystemFor,
  volumeAdjustedSets,
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
  /** Mesocycle mode's weekly set plan by muscle (issue #250); null with the mode off. */
  volume: ReadonlyMap<string, MuscleVolumePlan> | null;
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
  const exercises = new Map(input.exercises.map((exercise) => [exercise.id, exercise]));
  // Rows synced before the column existed have no volumeMode: off.
  const volume = block.volumeMode
    ? new Map(
        mesocycleVolumePlan({
          history: input.snapshot.history,
          exercises,
          block,
          now: input.now,
        }).map((plan) => [plan.muscle, plan]),
      )
    : null;
  return {
    snapshot: input.snapshot,
    settings: input.settings,
    block,
    lifts: new Map(liveBlockLifts(input.lifts, block.id).map((lift) => [lift.exerciseId, lift])),
    exercises,
    volume,
    now: input.now,
  };
}

/**
 * Mesocycle mode (issue #250): this week's working sets for an exercise,
 * the routine's sets scaled by its muscles' plans. Null when the mode is
 * off, the routine sets no count, no muscle of the exercise is planned, or
 * the routine item has its own progression rule (issue #255), which then
 * owns its sets: one automatic system per lift (ADR-016).
 */
export function dprVolumeSets(
  ctx: DprContext | null,
  exerciseId: string,
  target:
    | (Pick<RoutineExerciseRow, "targetSets"> &
        Partial<Pick<RoutineExerciseRow, "progressionRule">>)
    | null
    | undefined,
): number | null {
  const routineSets = target?.targetSets;
  if (!ctx?.volume || routineSets == null || routineSets <= 0) return null;
  if (ruleOf(target)) return null;
  const exercise = ctx.exercises.get(exerciseId);
  if (!exercise) return null;
  return volumeAdjustedSets(routineSets, exercise, ctx.volume);
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

/** e.g. "DPR volume: 4 sets this week (routine: 3)". */
export function dprVolumeLine(volumeSets: number, routineSets: number): string {
  return `PRP volume: ${volumeSets} ${volumeSets === 1 ? "set" : "sets"} this week (routine: ${routineSets})`;
}

export interface DprBadge {
  /** The call's word mark, shown with its arrow: "UP ↑", "STAY →" (`CallMark`). */
  word: string;
  /** The arrow alone, for plain-text lines like the decision log. */
  symbol: string;
  label: string;
  /** Tailwind classes for the pill. */
  className: string;
  /** Tailwind text color for the word mark on its own. */
  textClassName: string;
}

const BADGES: Record<DprCall, DprBadge> = {
  increase: {
    word: "UP",
    symbol: "↑",
    label: "PRP: increase",
    className: "border-green-600 text-green-700 dark:border-green-500 dark:text-green-400",
    textClassName: "text-green-700 dark:text-green-400",
  },
  hold: {
    word: "STAY",
    symbol: "→",
    label: "PRP: hold",
    className: "border-zinc-400 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400",
    textClassName: "text-zinc-600 dark:text-zinc-400",
  },
  deload: {
    word: "DOWN",
    symbol: "↓",
    label: "PRP: deload",
    className: "border-orange-600 text-orange-700 dark:border-orange-500 dark:text-orange-400",
    textClassName: "text-orange-700 dark:text-orange-400",
  },
  reenter: {
    word: "EASE",
    symbol: "↘",
    label: "PRP: easing back in",
    className: "border-orange-600 text-orange-700 dark:border-orange-500 dark:text-orange-400",
    textClassName: "text-orange-700 dark:text-orange-400",
  },
  light: {
    word: "LIGHT",
    symbol: "↓",
    label: "PRP: light day",
    className: "border-sky-600 text-sky-700 dark:border-sky-500 dark:text-sky-400",
    textClassName: "text-sky-700 dark:text-sky-400",
  },
  insufficient: {
    word: "RPE",
    symbol: "?",
    label: "PRP: needs RPE",
    className: "border-zinc-400 text-zinc-500 dark:border-zinc-600 dark:text-zinc-500",
    textClassName: "text-zinc-500 dark:text-zinc-500",
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
      return `PRP: ${lowerFirst(reason)} last time${delta ? ` → +${formatWeight(delta)} ${units}` : ""}`;
    }
    case "deload":
    case "reenter":
      return `PRP: ${lowerFirst(reason)}${weight === null ? "" : ` → ${formatWeight(weight)} ${units}`}`;
    case "hold":
    case "light":
      return `PRP: ${lowerFirst(reason)}`;
    case "insufficient":
      return reason === "Add RPE for PRP"
        ? "PRP: add RPE to your working sets so PRP can make a call"
        : "PRP: log this lift with RPE to get a call next time";
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

/** The call's rep target for working sets (issue #448); null falls back to "last time" reps. */
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
 * A routine's calls counted for its one badge (issue #284): each call with
 * how many lifts got it, most common first; ties keep the order the calls
 * first appear in.
 */
export function dprCallCounts(calls: readonly DprCallInfo[]): { call: DprCall; count: number }[] {
  const counts = new Map<DprCall, number>();
  for (const { decision } of calls) {
    counts.set(decision.call, (counts.get(decision.call) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([call, count]) => ({ call, count }));
}

/** The same counts as text, e.g. "UP ↑2 STAY →1". */
export function dprCallSummary(calls: readonly DprCallInfo[]): string {
  return dprCallCounts(calls)
    .map(({ call, count }) => `${BADGES[call].word} ${BADGES[call].symbol}${count}`)
    .join(" ");
}

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A decision-log line, e.g. "Sep 12 · UP ↑ 185→190 · 3×8 @ RPE 7.5". */
export function formatLogEntry(entry: DprLogEntry): string {
  const { decision } = entry;
  const { word, symbol } = dprBadge(decision.call);
  const from = decision.previousWeight;
  const to = decision.weight;
  const move =
    from !== null && to !== null && from !== to
      ? `${formatWeight(from)}→${formatWeight(to)}`
      : to !== null
        ? formatWeight(to)
        : "—";
  const reason = decision.reason.replace(/^Hit /, "");
  return `${shortDate(entry.sessionDate)} · ${word} ${symbol} ${move} · ${reason}`;
}
