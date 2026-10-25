import { MAX_ESTIMATE_REPS, estimateOneRepMax } from "../one-rep-max";
import { RPE_MAX, RPE_MIN } from "../sessions/rpe";
import type { EstimatedOneRepMaxSet } from "./estimated-one-rep-max-series";

/**
 * Predicted 1RM (issue #713). The daily e1RM (`estimatedOneRepMaxSeries`)
 * is one session's best set run through Epley, so an easy day reads as a
 * weaker lifter and a single great set reads as the new normal. The
 * prediction weighs a lift's whole recent history instead:
 *
 * - **RPE.** A set at RPE r left (10 − r) reps in reserve, so it counts as
 *   `reps + (10 − r)` reps to failure, capped at `MAX_ESTIMATE_REPS`.
 * - **Reps.** Low-rep sets predict a max better than high-rep ones, and a
 *   set with RPE logged better than one without, so each session's evidence
 *   is weighted by how reliable its best set is.
 * - **Time.** Older sessions count for less (a six-week half-life), and only
 *   the last six months are used at all.
 * - **Trend.** A weighted straight-line fit through those sessions gives the
 *   lift's level and its slope. The slope is shrunk toward flat when there
 *   are few sessions, capped at a believable weekly rate, and only carried
 *   forward a couple of weeks past the last session.
 * - **PRs.** A best set in the last six weeks holds the prediction up: a
 *   lighter day after a PR doesn't mean the strength went away.
 * - **Consistency.** After three weeks off, strength is assumed to fade
 *   about 1% a week (to at most 15% down), and the confidence drops with
 *   fewer, sparser sessions.
 */
export const PREDICTION_TUNING = {
  /** Sessions this many days before the last one weigh half as much. */
  halfLifeDays: 42,
  /** Sessions further back than this from the last one are ignored. */
  windowDays: 182,
  /** A best set this recent holds the prediction up (the PR floor). */
  peakDays: 42,
  /** The trend is carried at most this far past the last session. */
  maxExtrapolationDays: 14,
  /** The fitted slope is capped at this fraction of the level, per week. */
  maxWeeklyTrend: 0.015,
  /** The slope is scaled by (n − 1) / (n − 1 + this), for n sessions. */
  trendShrinkSessions: 4,
  /** A layoff this long costs nothing yet. */
  detrainingGraceDays: 21,
  /** After the grace period, the fraction lost per week off. */
  detrainingPerWeek: 0.01,
  /** Never predicted below this fraction of the trained level. */
  detrainingFloor: 0.85,
  /** A best set with no RPE logged counts this much. */
  noRpeReliability: 0.75,
  /** A best set at `MAX_ESTIMATE_REPS` reps to failure counts this much; 5 or fewer counts fully. */
  highRepReliability: 0.5,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A set the prediction reads: the daily e1RM's set plus its RPE and kind. */
export interface PredictionSet extends EstimatedOneRepMaxSet {
  rpe?: number | null;
  /** Warm-up sets are left out; absent means a working set. */
  kind?: string | null;
}

export type PredictionConfidence = "low" | "medium" | "high";

export interface PredictedOneRepMax {
  /** The predicted 1RM, unrounded beyond cents. */
  value: number;
  /** How fast the fitted trend is moving, in weight per week (after shrinking and capping). */
  trendPerWeek: number;
  confidence: PredictionConfidence;
  /** Sessions the prediction drew on. */
  sessions: number;
  /** Sessions per week over the eight weeks up to the prediction date. */
  sessionsPerWeek: number;
  /** Whole days from the last session to the prediction date. */
  daysSinceTrained: number;
}

export interface PredictedOneRepMaxPoint {
  date: Date;
  sessionId: string;
  /** The prediction as it stood right after this session. */
  predictedOneRepMax: number;
}

interface SessionEvidence {
  sessionId: string;
  time: number;
  estimate: number;
  reliability: number;
}

function repsInReserve(rpe: number | null | undefined): number | null {
  if (rpe == null || !Number.isFinite(rpe) || rpe < RPE_MIN || rpe > RPE_MAX) return null;
  return RPE_MAX - rpe;
}

function repReliability(repsToFailure: number): number {
  if (repsToFailure <= 5) return 1;
  const fraction = Math.min(1, (repsToFailure - 5) / (MAX_ESTIMATE_REPS - 5));
  return 1 - fraction * (1 - PREDICTION_TUNING.highRepReliability);
}

/** Each session's best RPE-adjusted estimate, oldest first. */
function sessionEvidence(sets: readonly PredictionSet[]): SessionEvidence[] {
  const bySession = new Map<string, SessionEvidence>();
  for (const set of sets) {
    if (set.kind === "warmup") continue;
    if (set.weight == null || set.reps == null || set.weight <= 0 || set.reps <= 0) continue;
    const reserve = repsInReserve(set.rpe);
    const repsToFailure = Math.min(MAX_ESTIMATE_REPS, set.reps + (reserve ?? 0));
    const estimate = estimateOneRepMax(set.weight, repsToFailure);
    const reliability =
      repReliability(repsToFailure) * (reserve == null ? PREDICTION_TUNING.noRpeReliability : 1);
    const time = set.completedAt.getTime();
    const existing = bySession.get(set.sessionId);
    if (!existing) {
      bySession.set(set.sessionId, { sessionId: set.sessionId, time, estimate, reliability });
    } else {
      existing.time = Math.max(existing.time, time);
      if (estimate > existing.estimate) {
        existing.estimate = estimate;
        existing.reliability = reliability;
      }
    }
  }
  return [...bySession.values()].sort((a, b) => a.time - b.time);
}

function detraining(daysOff: number): number {
  const { detrainingGraceDays, detrainingPerWeek, detrainingFloor } = PREDICTION_TUNING;
  if (daysOff <= detrainingGraceDays) return 1;
  return Math.max(detrainingFloor, 1 - (detrainingPerWeek * (daysOff - detrainingGraceDays)) / 7);
}

function confidenceFor(
  sessions: number,
  sessionsPerWeek: number,
  daysSince: number,
): PredictionConfidence {
  if (
    sessions >= 6 &&
    sessionsPerWeek >= 0.75 &&
    daysSince <= PREDICTION_TUNING.detrainingGraceDays
  )
    return "high";
  if (sessions >= 3 && daysSince <= PREDICTION_TUNING.windowDays / 2) return "medium";
  return "low";
}

/** `evidence` is sorted oldest first and every entry is at or before `asOf`. */
function predictFrom(
  evidence: readonly SessionEvidence[],
  asOf: number,
): PredictedOneRepMax | null {
  const last = evidence[evidence.length - 1];
  if (!last) return null;
  const tuning = PREDICTION_TUNING;
  const used = evidence.filter((entry) => last.time - entry.time <= tuning.windowDays * DAY_MS);

  // Weighted least squares on (days, estimate), centered on the weighted mean.
  let weightSum = 0;
  let meanX = 0;
  let meanY = 0;
  const weighted = used.map((entry) => {
    const ageDays = (last.time - entry.time) / DAY_MS;
    const weight = entry.reliability * 0.5 ** (ageDays / tuning.halfLifeDays);
    const x = (entry.time - last.time) / DAY_MS;
    weightSum += weight;
    meanX += weight * x;
    meanY += weight * entry.estimate;
    return { x, y: entry.estimate, weight };
  });
  meanX /= weightSum;
  meanY /= weightSum;
  let covariance = 0;
  let variance = 0;
  for (const point of weighted) {
    covariance += point.weight * (point.x - meanX) * (point.y - meanY);
    variance += point.weight * (point.x - meanX) ** 2;
  }
  // Under a day of spread: no slope to read.
  let slope = variance > 1e-9 && weighted.length > 1 ? covariance / variance : 0;
  const n = weighted.length;
  slope *= (n - 1) / (n - 1 + tuning.trendShrinkSessions);
  const cap = (meanY * tuning.maxWeeklyTrend) / 7;
  slope = Math.max(-cap, Math.min(cap, slope));

  const daysSince = Math.max(0, (asOf - last.time) / DAY_MS);
  const levelAtLast = meanY + slope * (0 - meanX);
  const trendLevel = levelAtLast + slope * Math.min(daysSince, tuning.maxExtrapolationDays);
  const peak = Math.max(
    0,
    ...used
      .filter((entry) => last.time - entry.time <= tuning.peakDays * DAY_MS)
      .map((entry) => entry.estimate),
  );
  const value = Math.max(trendLevel, peak) * detraining(daysSince);

  const eightWeeks = 56 * DAY_MS;
  const recent = evidence.filter((entry) => asOf - entry.time <= eightWeeks).length;
  const sessionsPerWeek = recent / 8;

  return {
    value: Math.round(value * 100) / 100,
    trendPerWeek: Math.round(slope * 7 * 100) / 100,
    confidence: confidenceFor(used.length, sessionsPerWeek, daysSince),
    sessions: used.length,
    sessionsPerWeek: Math.round(sessionsPerWeek * 100) / 100,
    daysSinceTrained: Math.floor(daysSince),
  };
}

/**
 * A lift's predicted 1RM as of `asOf`, from the sets logged at or before
 * it, or null with nothing weighted to go on. Callers pass already-resolved,
 * non-deleted sets for one exercise, the same ones the daily e1RM reads.
 */
export function predictOneRepMax(
  sets: readonly PredictionSet[],
  asOf: Date,
): PredictedOneRepMax | null {
  const time = asOf.getTime();
  return predictFrom(
    sessionEvidence(sets).filter((entry) => entry.time <= time),
    time,
  );
}

/**
 * The prediction as it stood after each session, oldest first, for drawing
 * next to the daily e1RM line. One point per session with a weighted
 * working set, keyed by session like `estimatedOneRepMaxSeries`.
 */
export function predictedOneRepMaxSeries(
  sets: readonly PredictionSet[],
): PredictedOneRepMaxPoint[] {
  const evidence = sessionEvidence(sets);
  const points: PredictedOneRepMaxPoint[] = [];
  for (let index = 0; index < evidence.length; index++) {
    const entry = evidence[index] as SessionEvidence;
    const prediction = predictFrom(evidence.slice(0, index + 1), entry.time);
    if (!prediction) continue;
    points.push({
      date: new Date(entry.time),
      sessionId: entry.sessionId,
      predictedOneRepMax: prediction.value,
    });
  }
  return points;
}
