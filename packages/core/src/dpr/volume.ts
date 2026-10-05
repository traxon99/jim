import {
  PRIMARY_MUSCLE_VOLUME_WEIGHT,
  SECONDARY_MUSCLE_VOLUME_WEIGHT,
} from "../history/volume-by-muscle";
import { WEEKLY_SET_TARGETS } from "../history/volume-targets";
import { type ExerciseCategory, isWarmupExercise } from "../warmups/category";
import type { DprHistoryEntry } from "./decide";
import { DPR_DELOAD_WEEK_DAYS, type DprBlockInfo } from "./lift-status";
import { MISS_RPE } from "./presets";

/**
 * Mesocycle mode (issue #250): on top of load, DPR grows each muscle's
 * weekly working sets through a block, RP-style, and the deload week cuts
 * them back. Like every DPR call, the plan is a pure function of set
 * history and the block, never stored (ADR-016).
 *
 * Each muscle starts from the weekly sets it got the week before the block
 * (or its first trained week in the block, with no history before it). Each
 * finished week then decides the next one from how that muscle's sessions
 * went: easy enough adds sets, a high RPE or skipped sets holds, a miss
 * drops sets.
 */

/** Weekly sets added (or dropped, after a miss) per muscle. */
export const VOLUME_STEP_SETS = 2;

/** A week whose sets for a muscle average this RPE or more holds its sets. */
export const VOLUME_HOLD_RPE = 9;

/** The deload week keeps this fraction of the last week's sets. */
export const VOLUME_DELOAD_FRACTION = 0.5;

/**
 * Where growth stops: the top of the hypertrophy range (more sets past it
 * add little, see docs/VOLUME-TARGETS.md), and never more than double the
 * starting sets so a lightly trained muscle isn't swamped.
 */
export const VOLUME_MAX_SETS = WEEKLY_SET_TARGETS.hypertrophy.max;
export const VOLUME_MAX_GROWTH = 2;

/** Why a week's plan is what it is. */
export type VolumeWeekCall = "start" | "add" | "hold" | "drop" | "max" | "deload";

export interface MuscleVolumeWeek {
  /** Block week, from 1; the deload week is `block.weeks + 1`. */
  week: number;
  planned: number;
  /** Working sets logged so far, weighted like `weeklyVolumeByMuscle`. */
  actual: number;
  call: VolumeWeekCall;
}

export interface MuscleVolumePlan {
  muscle: string;
  /** The weekly sets the routines were built around. */
  start: number;
  /** From the muscle's first planned week through the current one. */
  weeks: MuscleVolumeWeek[];
  /** This week's plan. */
  current: MuscleVolumeWeek;
}

export interface VolumeExercise {
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  category?: ExerciseCategory | null;
}

interface WeekStats {
  sets: number;
  /** Working sets where the muscle is primary, for feedback. */
  rpeSum: number;
  rpeCount: number;
  missed: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/** Week 0 is the week before the block; deload is `weeks + 1`; null = outside the block. */
function blockWeekOf(block: DprBlockInfo, date: Date): number | null {
  if (block.status === "deload") {
    const deloadStart = block.endsAt.getTime() - DPR_DELOAD_WEEK_DAYS * DAY_MS;
    if (date.getTime() >= deloadStart) return date < block.endsAt ? block.weeks + 1 : null;
  }
  const index = Math.floor((date.getTime() - block.startedAt.getTime()) / WEEK_MS);
  if (index < -1 || index >= block.weeks) return null;
  return index + 1;
}

function emptyStats(): WeekStats {
  return { sets: 0, rpeSum: 0, rpeCount: 0, missed: false };
}

/** Per muscle, per block week (0 = the week before), what was logged. */
function weeklyStats(
  history: readonly DprHistoryEntry[],
  exercises: ReadonlyMap<string, VolumeExercise>,
  block: DprBlockInfo,
): Map<string, Map<number, WeekStats>> {
  const byMuscle = new Map<string, Map<number, WeekStats>>();
  const statsFor = (muscle: string, week: number) => {
    let weeks = byMuscle.get(muscle);
    if (!weeks) {
      weeks = new Map();
      byMuscle.set(muscle, weeks);
    }
    let stats = weeks.get(week);
    if (!stats) {
      stats = emptyStats();
      weeks.set(week, stats);
    }
    return stats;
  };

  for (const entry of history) {
    const exercise = exercises.get(entry.exerciseId);
    if (!exercise || isWarmupExercise(exercise)) continue;
    const week = blockWeekOf(block, entry.date);
    if (week === null) continue;
    // Working sets only (issue #395): warm-up sets aren't training volume.
    const sets = entry.sets.filter(
      (set) => set.kind !== "warmup" && set.reps !== null && set.reps > 0,
    );
    if (sets.length === 0) continue;

    for (const muscle of exercise.secondaryMuscles) {
      statsFor(muscle, week).sets += sets.length * SECONDARY_MUSCLE_VOLUME_WEIGHT;
    }
    for (const muscle of exercise.primaryMuscles) {
      const stats = statsFor(muscle, week);
      stats.sets += sets.length * PRIMARY_MUSCLE_VOLUME_WEIGHT;
      for (const set of sets) {
        if (set.rpe !== null) {
          stats.rpeSum += set.rpe;
          stats.rpeCount += 1;
        }
        if (set.kind === "working" && (set.reps ?? 0) < entry.repRange.low) stats.missed = true;
      }
    }
  }
  return byMuscle;
}

/** The next week's call from how a finished week went. */
function nextCall(stats: WeekStats | undefined, planned: number): VolumeWeekCall {
  if (!stats || stats.sets === 0) return "hold";
  const avgRpe = stats.rpeCount > 0 ? stats.rpeSum / stats.rpeCount : null;
  if (stats.missed || (avgRpe !== null && avgRpe >= MISS_RPE)) return "drop";
  if (avgRpe !== null && avgRpe >= VOLUME_HOLD_RPE) return "hold";
  // Skipped a good part of the plan: no point asking for more.
  if (stats.sets < planned - VOLUME_STEP_SETS) return "hold";
  return "add";
}

/**
 * Each muscle's weekly set plan for a block, through the week of `now`.
 * Muscles only show up once they've been trained in or just before the
 * block.
 */
export function mesocycleVolumePlan(input: {
  history: readonly DprHistoryEntry[];
  exercises: ReadonlyMap<string, VolumeExercise>;
  block: DprBlockInfo;
  now: Date;
}): MuscleVolumePlan[] {
  const { block, now } = input;
  const nowWeek = blockWeekOf(block, now) ?? block.weeks;
  const lastWeek = Math.max(1, Math.min(nowWeek, block.weeks));
  const deload = nowWeek === block.weeks + 1;
  const stats = weeklyStats(input.history, input.exercises, block);

  const plans: MuscleVolumePlan[] = [];
  for (const [muscle, weeks] of stats) {
    const before = weeks.get(0)?.sets ?? 0;
    let firstWeek = 1;
    let start = before;
    if (start === 0) {
      // No history before the block: the first week it was trained sets the bar.
      const trained = [...weeks.entries()]
        .filter(([week, s]) => week >= 1 && week <= lastWeek && s.sets > 0)
        .sort((a, b) => a[0] - b[0])[0];
      if (!trained) continue;
      firstWeek = trained[0];
      start = trained[1].sets;
    }
    start = roundHalf(start);
    const max = Math.max(start, Math.min(VOLUME_MAX_SETS, start * VOLUME_MAX_GROWTH));

    const planWeeks: MuscleVolumeWeek[] = [];
    let planned = start;
    let call: VolumeWeekCall = "start";
    for (let week = firstWeek; week <= lastWeek; week += 1) {
      if (week > firstWeek) {
        const previous = planWeeks[planWeeks.length - 1] as MuscleVolumeWeek;
        call = nextCall(weeks.get(week - 1), previous.planned);
        if (call === "add") {
          planned = Math.min(max, planned + VOLUME_STEP_SETS);
          if (planned === previous.planned) call = "max";
        } else if (call === "drop") {
          planned = Math.max(1, planned - VOLUME_STEP_SETS);
        }
      }
      planWeeks.push({ week, planned, actual: weeks.get(week)?.sets ?? 0, call });
    }
    if (deload) {
      planWeeks.push({
        week: block.weeks + 1,
        planned: Math.max(1, roundHalf(planned * VOLUME_DELOAD_FRACTION)),
        actual: weeks.get(block.weeks + 1)?.sets ?? 0,
        call: "deload",
      });
    }
    plans.push({
      muscle,
      start,
      weeks: planWeeks,
      current: planWeeks[planWeeks.length - 1] as MuscleVolumeWeek,
    });
  }
  return plans.sort((a, b) => a.muscle.localeCompare(b.muscle));
}

/**
 * How many working sets an exercise gets this week: the routine's sets
 * scaled by how far its primary muscles' plans have moved from where they
 * started, so every exercise for a muscle shares the added (or dropped)
 * sets. Null when no primary muscle has a plan.
 */
export function volumeAdjustedSets(
  baseSets: number,
  exercise: VolumeExercise,
  plans: ReadonlyMap<string, MuscleVolumePlan>,
): number | null {
  if (isWarmupExercise(exercise)) return null;
  const ratios: number[] = [];
  for (const muscle of exercise.primaryMuscles) {
    const plan = plans.get(muscle);
    if (plan && plan.start > 0) ratios.push(plan.current.planned / plan.start);
  }
  if (ratios.length === 0) return null;
  const ratio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
  return Math.max(1, Math.round(baseSets * ratio));
}
