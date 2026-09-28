/**
 * Dynamic Progression (DPR, issue #207) presets — every tunable number the
 * decision and goal engines read lives here, so retuning DPR means editing
 * this file and nothing else.
 */

export type DprPresetName = "conservative" | "moderate" | "aggressive";

/** Where in the goal table's range (see goal.ts) a preset aims. */
export type DprGoalPoint = "low" | "mid" | "high";

export interface DprPreset {
  name: DprPresetName;
  /** A session qualifies for an increase only at or below this average RPE. */
  rpeCap: number;
  /** Consecutive qualifying sessions at one weight before it goes up. */
  qualifyingSessions: number;
  /**
   * Jump as a fraction of the current working weight, rounded to the
   * equipment increment and never less than one step. `null` = exactly one
   * step.
   */
  jumpPct: number | null;
  /** Consecutive misses at one weight before a deload. */
  deloadAfterMisses: number;
  goalPoint: DprGoalPoint;
}

export const DPR_PRESETS: Readonly<Record<DprPresetName, DprPreset>> = {
  conservative: {
    name: "conservative",
    rpeCap: 7.5,
    qualifyingSessions: 2,
    jumpPct: null,
    deloadAfterMisses: 2,
    goalPoint: "low",
  },
  moderate: {
    name: "moderate",
    rpeCap: 8,
    qualifyingSessions: 1,
    jumpPct: 0.025,
    deloadAfterMisses: 3,
    goalPoint: "mid",
  },
  aggressive: {
    name: "aggressive",
    rpeCap: 9,
    qualifyingSessions: 1,
    jumpPct: 0.05,
    deloadAfterMisses: 3,
    goalPoint: "high",
  },
};

export const DPR_PRESET_NAMES: readonly DprPresetName[] = [
  "conservative",
  "moderate",
  "aggressive",
];

/** A session whose average RPE reaches this is a miss, whatever the reps. */
export const MISS_RPE = 9.5;

/**
 * Rest compliance (issue #233): a session with a set started on a short rest
 * (see SHORT_REST_FRACTION) still qualifies for an increase this far over
 * the preset's RPE cap — the same effort on less rest is the stronger
 * performance.
 */
export const SHORT_REST_RPE_CREDIT = 0.5;

/** "Go light" (issue #235) takes this off the day's weight, rounded down. */
export const LIGHT_DAY_PCT = 0.1;

/** How much a deload takes off, before rounding down to the increment. */
export const DELOAD_PCT = 0.1;

/**
 * Layoff re-entry, checked longest gap first: 28+ days off drops the weight
 * 10%, 14–27 days drops it 5%.
 */
export const LAYOFF_REENTRY: readonly { minDays: number; pct: number }[] = [
  { minDays: 28, pct: 0.1 },
  { minDays: 14, pct: 0.05 },
];

/** Rep range used when neither the routine nor any past routine sets one. */
export const DPR_DEFAULT_REP_RANGE = { low: 6, high: 10 } as const;

/** Focused lifts per user. */
export const DPR_MAX_FOCUS = 5;

/** How many candidates the focus picker offers, and over what window. */
export const DPR_FOCUS_CANDIDATE_COUNT = 10;
export const DPR_FOCUS_WINDOW_DAYS = 90;

/** Block lengths DPR supports, in weeks. */
export const DPR_BLOCK_WEEKS = [6, 8, 12] as const;
export type DprBlockWeeks = (typeof DPR_BLOCK_WEEKS)[number];
