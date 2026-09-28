import {
  type DprDecision,
  type RepRange,
  type SessionIntensity,
  decideNextWeight,
  decisionLog,
  resolveRepRange,
  sessionsForKey,
} from "./decide";
import { rpeAdjustedE1rm } from "./e1rm";
import {
  type IncrementOverrides,
  resolveIncrement,
  roundToIncrement,
} from "./equipment-increments";
import { type OnTrackStatus, layoffDays, onTrackStatus } from "./goal";
import { applyIntensity } from "./intensity";
import { DELOAD_PCT, DPR_PRESETS, type DprPresetName } from "./presets";
import { type DprSnapshot, e1rmSeries } from "./snapshot";

/**
 * Per-lift DPR status shared by the web app and the MCP server (issues
 * #212–#215, #218), so both show the same call, goal status, log and recap
 * from the same history.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const DPR_DELOAD_WEEK_DAYS = 7;

export interface DprUserSettings {
  units: "lb" | "kg";
  aggressiveness: DprPresetName;
  increments: IncrementOverrides;
  defaultRange: RepRange;
}

export interface DprBlockInfo {
  startedAt: Date;
  weeks: number;
  endsAt: Date;
  status: "active" | "deload" | "completed";
}

export interface DprLiftGoal {
  baselineE1rm: number | null;
  goalE1rm: number | null;
}

export interface DprLiftCall {
  exerciseId: string;
  decision: DprDecision;
  repRange: RepRange;
  increment: number;
}

/** The block DPR is running now (active or in its deload week); newest started wins. */
export function currentBlockOf<T extends DprBlockInfo & { deletedAt: Date | null }>(
  blocks: readonly T[],
): T | null {
  return (
    blocks
      .filter((block) => !block.deletedAt && block.status !== "completed")
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] ?? null
  );
}

/** A deload week (issue #215) calls every focused lift at −10%, rounded down. */
export function isDeloadWeek(block: DprBlockInfo | null, now: Date): boolean {
  return block?.status === "deload" && now < block.endsAt;
}

export function callForLift(input: {
  snapshot: DprSnapshot;
  exerciseId: string;
  equipment: string | null | undefined;
  settings: DprUserSettings;
  target?: { targetRepsLow: number | null; targetRepsHigh: number | null } | null;
  fallbackWeight?: number | null;
  block?: DprBlockInfo | null;
  /** The session's "how hard today?" pick (issue #235); ignored in a deload week. */
  intensity?: SessionIntensity | null;
  now: Date;
}): DprLiftCall {
  const { snapshot, exerciseId, settings, now } = input;
  const repRange = resolveRepRange(
    exerciseId,
    input.target ?? null,
    snapshot.routineRanges,
    settings.defaultRange,
  );
  const increment = resolveIncrement(input.equipment, settings.units, settings.increments);
  let decision = decideNextWeight({
    sessions: sessionsForKey(snapshot.history, exerciseId, repRange),
    repRange,
    preset: DPR_PRESETS[settings.aggressiveness],
    increment,
    now,
    fallbackWeight: input.fallbackWeight ?? null,
  });

  if (isDeloadWeek(input.block ?? null, now)) {
    const from = decision.previousWeight ?? decision.weight;
    decision = {
      ...decision,
      call: "deload",
      weight: from === null ? null : roundToIncrement(from * (1 - DELOAD_PCT), increment, "down"),
      previousWeight: from,
      targetReps: repRange.low,
      reason: "Deload week",
      streak: 0,
    };
  } else {
    decision = applyIntensity(decision, input.intensity, increment);
  }
  return { exerciseId, decision, repRange, increment };
}

/**
 * When the block really ends: its planned end pushed back by any layoffs
 * inside it (a 14+ day gap between sessions of its focused lifts).
 */
export function blockEffectiveEnd(
  block: DprBlockInfo,
  snapshot: DprSnapshot,
  exerciseIds: readonly string[],
  now: Date,
): Date {
  if (block.status === "deload") return block.endsAt;
  const ids = new Set(exerciseIds);
  const dates = snapshot.history.filter((h) => ids.has(h.exerciseId)).map((h) => h.date);
  const until = now < block.endsAt ? now : block.endsAt;
  return new Date(block.endsAt.getTime() + layoffDays(dates, block.startedAt, until) * DAY_MS);
}

/** An active block past its (layoff-shifted) end is waiting on its recap. */
export function blockHasEnded(
  block: DprBlockInfo,
  snapshot: DprSnapshot,
  exerciseIds: readonly string[],
  now: Date,
): boolean {
  return block.status === "active" && now >= blockEffectiveEnd(block, snapshot, exerciseIds, now);
}

export interface DprLiftProgress {
  /** Best of the latest 3 in-block e1RMs; the baseline before any. */
  currentE1rm: number | null;
  status: OnTrackStatus | null;
}

function recentBest(points: readonly { e1rm: number }[]): number | null {
  const latest = points.slice(-3);
  return latest.length === 0 ? null : Math.max(...latest.map((p) => p.e1rm));
}

export function liftProgress(
  snapshot: DprSnapshot,
  exerciseId: string,
  block: DprBlockInfo,
  goal: DprLiftGoal,
  now: Date,
): DprLiftProgress {
  const series = e1rmSeries(snapshot.history, exerciseId);
  const inBlock = series.filter((p) => p.date >= block.startedAt && p.date <= now);
  const currentE1rm = recentBest(inBlock) ?? goal.baselineE1rm;
  if (goal.baselineE1rm === null || goal.goalE1rm === null) return { currentE1rm, status: null };
  return {
    currentE1rm,
    status: onTrackStatus(
      {
        startDate: block.startedAt,
        weeks: block.weeks,
        baselineE1rm: goal.baselineE1rm,
        goalE1rm: goal.goalE1rm,
      },
      series,
      now,
    ),
  };
}

export interface DprLogEntry {
  sessionDate: Date;
  repRange: RepRange;
  decision: DprDecision;
}

/**
 * The replayed call after each session of a lift, across every rep range it
 * was trained at, newest first. Derived, never stored.
 */
export function liftDecisionLog(input: {
  snapshot: DprSnapshot;
  exerciseId: string;
  equipment: string | null | undefined;
  settings: DprUserSettings;
  now: Date;
}): DprLogEntry[] {
  const { snapshot, exerciseId, settings, now } = input;
  const increment = resolveIncrement(input.equipment, settings.units, settings.increments);
  const ranges = new Map<string, RepRange>();
  for (const entry of snapshot.history) {
    if (entry.exerciseId !== exerciseId) continue;
    ranges.set(`${entry.repRange.low}-${entry.repRange.high}`, entry.repRange);
  }
  const entries: DprLogEntry[] = [];
  for (const repRange of ranges.values()) {
    for (const logged of decisionLog(sessionsForKey(snapshot.history, exerciseId, repRange), {
      repRange,
      preset: DPR_PRESETS[settings.aggressiveness],
      increment,
      now,
    })) {
      entries.push({ ...logged, repRange });
    }
  }
  return entries.sort((a, b) => b.sessionDate.getTime() - a.sessionDate.getTime());
}

/** The rep ranges a lift has been trained at, most-used first. */
export function liftRepRanges(snapshot: DprSnapshot, exerciseId: string): RepRange[] {
  const counts = new Map<string, { range: RepRange; count: number }>();
  for (const entry of snapshot.history) {
    if (entry.exerciseId !== exerciseId) continue;
    const key = `${entry.repRange.low}-${entry.repRange.high}`;
    const current = counts.get(key) ?? { range: entry.repRange, count: 0 };
    current.count++;
    counts.set(key, current);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).map((c) => c.range);
}

export interface DprBestSet {
  date: Date;
  weight: number;
  reps: number;
  rpe: number | null;
  e1rm: number;
}

export interface DprLiftRecap {
  exerciseId: string;
  baselineE1rm: number | null;
  finalE1rm: number | null;
  /** Fraction, e.g. 0.062 for +6.2%. */
  change: number | null;
  goalE1rm: number | null;
  hitGoal: boolean | null;
  bestSet: DprBestSet | null;
}

/** Block-end numbers for one lift (issue #215). */
export function liftRecap(
  snapshot: DprSnapshot,
  exerciseId: string,
  block: DprBlockInfo,
  goal: DprLiftGoal,
  end: Date,
): DprLiftRecap {
  const inBlock = (date: Date) => date >= block.startedAt && date <= end;
  const series = e1rmSeries(snapshot.history, exerciseId).filter((p) => inBlock(p.date));
  const finalE1rm = recentBest(series);

  let bestSet: DprBestSet | null = null;
  for (const entry of snapshot.history) {
    if (entry.exerciseId !== exerciseId || !inBlock(entry.date)) continue;
    for (const set of entry.sets) {
      if (set.kind !== "working" || !set.weight || !set.reps) continue;
      const e1rm = rpeAdjustedE1rm(set.weight, set.reps, set.rpe);
      if (!bestSet || e1rm > bestSet.e1rm) {
        bestSet = { date: entry.date, weight: set.weight, reps: set.reps, rpe: set.rpe, e1rm };
      }
    }
  }

  const { baselineE1rm, goalE1rm } = goal;
  return {
    exerciseId,
    baselineE1rm,
    finalE1rm,
    change:
      baselineE1rm && finalE1rm !== null
        ? Math.round(((finalE1rm - baselineE1rm) / baselineE1rm) * 1000) / 1000
        : null,
    goalE1rm,
    hitGoal: goalE1rm === null || finalE1rm === null ? null : finalE1rm >= goalE1rm,
    bestSet,
  };
}

export interface DprBlockRecapSummary {
  goalsHit: number;
  goalsSet: number;
  /** Mean change across lifts with one, or null. */
  averageChange: number | null;
}

export function blockRecapSummary(recaps: readonly DprLiftRecap[]): DprBlockRecapSummary {
  const withGoal = recaps.filter((r) => r.hitGoal !== null);
  const changes = recaps.flatMap((r) => (r.change === null ? [] : [r.change]));
  return {
    goalsHit: withGoal.filter((r) => r.hitGoal).length,
    goalsSet: withGoal.length,
    averageChange:
      changes.length === 0
        ? null
        : Math.round((changes.reduce((a, b) => a + b, 0) / changes.length) * 1000) / 1000,
  };
}

/** Next block's baselines are the finished block's final e1RMs (issue #215). */
export function nextBlockBaselines(recaps: readonly DprLiftRecap[]): Map<string, number> {
  const baselines = new Map<string, number>();
  for (const recap of recaps) {
    const value = recap.finalE1rm ?? recap.baselineE1rm;
    if (value !== null) baselines.set(recap.exerciseId, value);
  }
  return baselines;
}
