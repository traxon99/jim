import { tierForOneRepMax } from "../strength-standards/lookup";
import type {
  StandardLift,
  StrengthProfile,
  StrengthStandardTier,
} from "../strength-standards/types";
import type { DprGoalPoint, DprPreset } from "./presets";

export type ExperienceLevel = "novice" | "intermediate" | "advanced";

export const EXPERIENCE_LEVELS: readonly ExperienceLevel[] = ["novice", "intermediate", "advanced"];

/**
 * Expected e1RM gain per 12 weeks by training status, at each preset's goal
 * point. Novices gain far faster than trained lifters and the rate falls off
 * steeply with training age — ranges informed by the dose-response and
 * training-status meta-analyses: Rhea et al. 2003 (Med Sci Sports Exerc
 * 35:456–464) and Peterson, Rhea & Alvar 2004/2005 (J Strength Cond Res
 * 18:377–382; 19:950–958).
 */
export const GOAL_TABLE: Readonly<Record<ExperienceLevel, Record<DprGoalPoint, number>>> = {
  novice: { low: 0.2, mid: 0.25, high: 0.3 },
  intermediate: { low: 0.08, mid: 0.1, high: 0.12 },
  advanced: { low: 0.02, mid: 0.035, high: 0.05 },
};

const TIER_TO_LEVEL: Record<StrengthStandardTier, ExperienceLevel> = {
  beginner: "novice",
  novice: "novice",
  intermediate: "intermediate",
  advanced: "advanced",
  elite: "advanced",
};

export interface InferExperienceInput {
  /** Weeks since the user's first logged session. */
  historyWeeks: number;
  /** Best e1RM per standard lift the user has history for. */
  e1rmByLift: Partial<Record<StandardLift, number>>;
  profile: StrengthProfile | null;
}

/**
 * Strength standards when the profile and at least one supported lift allow
 * it (the lower median across lifts, so one standout lift doesn't promote
 * the whole block); otherwise training age: <6 months novice, <2 years
 * intermediate, else advanced. The setup wizard lets the user override.
 */
export function inferExperience(input: InferExperienceInput): ExperienceLevel {
  const { profile } = input;
  if (profile && profile.bodyweight > 0) {
    const ranks: number[] = [];
    for (const [lift, e1rm] of Object.entries(input.e1rmByLift)) {
      if (e1rm === undefined || e1rm <= 0) continue;
      const tier = tierForOneRepMax(lift as StandardLift, e1rm, profile);
      ranks.push(EXPERIENCE_LEVELS.indexOf(tier === null ? "novice" : TIER_TO_LEVEL[tier]));
    }
    if (ranks.length > 0) {
      ranks.sort((a, b) => a - b);
      return EXPERIENCE_LEVELS[
        ranks[Math.floor((ranks.length - 1) / 2)] as number
      ] as ExperienceLevel;
    }
  }
  if (input.historyWeeks < 26) return "novice";
  if (input.historyWeeks < 104) return "intermediate";
  return "advanced";
}

/** Target e1RM for a block: the 12-week gain scaled linearly to `weeks`. */
export function computeGoal(
  baselineE1rm: number,
  level: ExperienceLevel,
  preset: DprPreset,
  weeks: number,
): number {
  const gain = GOAL_TABLE[level][preset.goalPoint] * (weeks / 12);
  return Math.round(baselineE1rm * (1 + gain) * 100) / 100;
}

export interface E1rmPoint {
  date: Date;
  e1rm: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A gap this long between sessions counts as a layoff (matches re-entry). */
const LAYOFF_MIN_DAYS = 14;
const ON_TRACK_BAND = 0.02;

/** Best e1RM from the last 3 eligible sessions before the block starts. */
export function baselineE1rm(series: readonly E1rmPoint[], blockStart: Date): number | null {
  const before = series
    .filter((p) => p.date < blockStart && p.e1rm > 0)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 3);
  if (before.length === 0) return null;
  return Math.max(...before.map((p) => p.e1rm));
}

/** Total days of layoff gaps (14+ days) inside [start, now]. */
export function layoffDays(dates: readonly Date[], start: Date, now: Date): number {
  const times = [start.getTime(), ...dates.map((d) => d.getTime()), now.getTime()]
    .filter((t) => t >= start.getTime() && t <= now.getTime())
    .sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = Math.floor(((times[i] as number) - (times[i - 1] as number)) / DAY_MS);
    if (gap >= LAYOFF_MIN_DAYS) total += gap;
  }
  return total;
}

export interface DprBlockGoal {
  startDate: Date;
  weeks: number;
  baselineE1rm: number;
  goalE1rm: number;
}

/** The block's goal date, pushed back by any layoffs. */
export function goalDate(block: DprBlockGoal, layoff: number): Date {
  return new Date(block.startDate.getTime() + (block.weeks * 7 + layoff) * DAY_MS);
}

export type OnTrackStatus = "ahead" | "on_track" | "behind";

/**
 * Compares where the lift is (best of the latest 3 in-block e1RMs, to smooth
 * a single off day) with a straight line from baseline to goal, ±2%. Layoff
 * days don't count toward elapsed time. No in-block sessions yet → on track.
 */
export function onTrackStatus(
  block: DprBlockGoal,
  e1rmSeries: readonly E1rmPoint[],
  now: Date,
): OnTrackStatus {
  const inBlock = e1rmSeries
    .filter((p) => p.date >= block.startDate && p.date <= now && p.e1rm > 0)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  if (inBlock.length === 0) return "on_track";

  const layoff = layoffDays(
    inBlock.map((p) => p.date),
    block.startDate,
    now,
  );
  const elapsedDays = (now.getTime() - block.startDate.getTime()) / DAY_MS - layoff;
  const progress = Math.min(1, Math.max(0, elapsedDays / (block.weeks * 7)));
  const expected = block.baselineE1rm + (block.goalE1rm - block.baselineE1rm) * progress;
  const actual = Math.max(...inBlock.slice(0, 3).map((p) => p.e1rm));

  if (actual >= expected * (1 + ON_TRACK_BAND)) return "ahead";
  if (actual <= expected * (1 - ON_TRACK_BAND)) return "behind";
  return "on_track";
}
