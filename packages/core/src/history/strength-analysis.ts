import type { EstimateOneRepMaxOptions } from "../one-rep-max";
import { type OneRepMaxPoint, estimatedOneRepMaxSeries } from "./estimated-one-rep-max-series";
import { startOfWeek } from "./week-grouping";

/**
 * The web portal's analysis views (issue #38) all look back over one of
 * these windows. "all" is every set ever logged.
 */
export type AnalysisRange = "4w" | "12w" | "26w" | "52w" | "all";

export const ANALYSIS_RANGES: readonly {
  id: AnalysisRange;
  label: string;
  weeks: number | null;
}[] = [
  { id: "4w", label: "4 weeks", weeks: 4 },
  { id: "12w", label: "12 weeks", weeks: 12 },
  { id: "26w", label: "6 months", weeks: 26 },
  { id: "52w", label: "1 year", weeks: 52 },
  { id: "all", label: "All time", weeks: null },
];

export const DEFAULT_ANALYSIS_RANGE: AnalysisRange = "12w";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** The earliest instant a range includes, or null for "all". */
export function analysisRangeStart(range: AnalysisRange, now: Date): Date | null {
  const weeks = ANALYSIS_RANGES.find((option) => option.id === range)?.weeks ?? null;
  return weeks == null ? null : new Date(now.getTime() - weeks * WEEK_MS);
}

/**
 * One resolved, non-deleted working set, joined to its exercise and session.
 * Callers leave out warm-up sets and warm-up exercises: the analysis is
 * about working strength and training load, not how often a warm-up ran.
 */
export interface AnalysisSet {
  exerciseId: string;
  sessionId: string;
  completedAt: Date;
  weight: number | null;
  reps: number | null;
}

function inRange(date: Date, since: Date | null): boolean {
  return since == null || date.getTime() >= since.getTime();
}

function setVolume(set: Pick<AnalysisSet, "weight" | "reps">): number {
  if (set.weight == null || set.reps == null || set.weight <= 0 || set.reps <= 0) return 0;
  return set.weight * set.reps;
}

export interface TrainingSummary {
  /** Distinct sessions with at least one set in range. */
  workouts: number;
  sets: number;
  /** Sum of weight × reps across weighted sets. */
  volume: number;
  workoutsPerWeek: number;
}

/**
 * Headline numbers for a range. The per-week rate divides by the range's
 * length — or, for "all", by the span from the first set to `now` (at
 * least one week, so a brand-new user's first workout isn't "7/week").
 */
export function summarizeTraining(
  sets: readonly AnalysisSet[],
  since: Date | null,
  now: Date,
): TrainingSummary {
  const sessionIds = new Set<string>();
  let setCount = 0;
  let volume = 0;
  let earliest: number | null = null;

  for (const set of sets) {
    if (!inRange(set.completedAt, since)) continue;
    sessionIds.add(set.sessionId);
    setCount += 1;
    volume += setVolume(set);
    const time = set.completedAt.getTime();
    if (earliest == null || time < earliest) earliest = time;
  }

  const spanStart = since?.getTime() ?? earliest ?? now.getTime();
  const weeks = Math.max(1, (now.getTime() - spanStart) / WEEK_MS);

  return {
    workouts: sessionIds.size,
    sets: setCount,
    volume,
    workoutsPerWeek: sessionIds.size / weeks,
  };
}

export interface StrengthTrend {
  exerciseId: string;
  /** Per-session best estimated 1RM within the range, oldest first. */
  points: OneRepMaxPoint[];
  /** First in-range point's estimated 1RM. */
  start: number;
  /** Latest in-range point's estimated 1RM. */
  current: number;
  change: number;
  /** Null when `start` is 0 (can't express a change from nothing as a percent). */
  changePercent: number | null;
  /** Best estimated 1RM ever, not just within the range. */
  allTimeBest: number;
  /** Sessions in range that trained this exercise with a weight and reps. */
  sessions: number;
}

/**
 * Per-exercise estimated-1RM trend over a range, built on the same
 * `estimatedOneRepMaxSeries` the exercise detail chart uses so both show
 * identical numbers. Exercises with no weighted set in range are left out.
 * Sorted by how often the exercise was trained, then by current estimate —
 * the lifts someone actually does most float to the top.
 */
export function strengthTrends(
  sets: readonly AnalysisSet[],
  since: Date | null,
  options: EstimateOneRepMaxOptions = {},
): StrengthTrend[] {
  const setsByExercise = new Map<string, AnalysisSet[]>();
  for (const set of sets) {
    const list = setsByExercise.get(set.exerciseId);
    if (list) {
      list.push(set);
    } else {
      setsByExercise.set(set.exerciseId, [set]);
    }
  }

  const trends: StrengthTrend[] = [];
  for (const [exerciseId, exerciseSets] of setsByExercise) {
    const series = estimatedOneRepMaxSeries(exerciseSets, options);
    const points = series.filter((point) => inRange(point.date, since));
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) continue;

    const change = last.estimatedOneRepMax - first.estimatedOneRepMax;
    trends.push({
      exerciseId,
      points,
      start: first.estimatedOneRepMax,
      current: last.estimatedOneRepMax,
      change,
      changePercent:
        first.estimatedOneRepMax > 0 ? (change / first.estimatedOneRepMax) * 100 : null,
      allTimeBest: Math.max(...series.map((point) => point.estimatedOneRepMax)),
      sessions: points.length,
    });
  }

  return trends.sort((a, b) => b.sessions - a.sessions || b.current - a.current);
}

export interface WeeklyVolumeTotal {
  weekStart: Date;
  volume: number;
  sets: number;
  workouts: number;
}

/**
 * Total volume per week across every exercise, oldest first, with an
 * explicit zero entry for weeks with no training — so a chart of it shows a
 * missed week as a gap rather than silently closing it up. Starts at the
 * range's first week (or the first set's, for "all") and runs to `now`'s.
 */
export function weeklyVolumeTotals(
  sets: readonly AnalysisSet[],
  weekStart: number,
  since: Date | null,
  now: Date,
): WeeklyVolumeTotal[] {
  const inRangeSets = sets.filter((set) => inRange(set.completedAt, since));
  const firstDate =
    since ??
    inRangeSets.reduce<Date | null>(
      (earliest, set) =>
        earliest == null || set.completedAt < earliest ? set.completedAt : earliest,
      null,
    );
  if (firstDate == null) return [];

  const totals = new Map<number, { volume: number; sets: number; sessionIds: Set<string> }>();
  for (const set of inRangeSets) {
    const key = startOfWeek(set.completedAt, weekStart).getTime();
    const total = totals.get(key) ?? { volume: 0, sets: 0, sessionIds: new Set<string>() };
    total.volume += setVolume(set);
    total.sets += 1;
    total.sessionIds.add(set.sessionId);
    totals.set(key, total);
  }

  const result: WeeklyVolumeTotal[] = [];
  const lastWeek = startOfWeek(now, weekStart).getTime();
  // Stepped by calendar date rather than a fixed 7 × 24h, so a week that
  // crosses a DST change still lands exactly on the next week's start.
  for (
    let week = startOfWeek(firstDate, weekStart);
    week.getTime() <= lastWeek;
    week = new Date(week.getFullYear(), week.getMonth(), week.getDate() + 7)
  ) {
    const total = totals.get(week.getTime());
    result.push({
      weekStart: week,
      volume: total?.volume ?? 0,
      sets: total?.sets ?? 0,
      workouts: total?.sessionIds.size ?? 0,
    });
  }
  return result;
}
