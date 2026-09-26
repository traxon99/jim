import { jumpFor, roundToIncrement } from "./equipment-increments";
import {
  DELOAD_PCT,
  DPR_DEFAULT_REP_RANGE,
  type DprPreset,
  LAYOFF_REENTRY,
  MISS_RPE,
} from "./presets";

/**
 * The DPR decision engine (issue #208): a pure function of one
 * (exercise, rep range)'s logged history. Nothing it returns is persisted —
 * the decision log is replayed from sets on demand (see `decisionLog`).
 */

export type DprSetKind = "warmup" | "working" | "drop" | "failure";

export interface DprSet {
  kind: DprSetKind;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
}

export interface DprSession {
  date: Date;
  sets: readonly DprSet[];
}

export interface RepRange {
  low: number;
  high: number;
}

export type DprCall = "increase" | "hold" | "deload" | "reenter" | "insufficient";

export interface DprDecision {
  call: DprCall;
  /** Suggested working weight for the next session; null only with no history and no fallback. */
  weight: number | null;
  /** The weight the call is made from (last lifted), for "+5 lb" style deltas; null with no history. */
  previousWeight: number | null;
  /** Rep target to aim for at that weight: the bottom of the range after any change. */
  targetReps: number | null;
  /** Short, user-facing, e.g. "Hit 3×8 @ RPE 7.5". */
  reason: string;
  /** Qualifying streak for increase/hold-on-track, miss streak for hold-on-miss/deload. */
  streak: number;
}

export interface DecideInput {
  /** This (exercise, rep range)'s history, newest first. */
  sessions: readonly DprSession[];
  repRange: RepRange;
  preset: DprPreset;
  increment: number;
  now: Date;
  /** Used when there is no usable history, e.g. the routine's `targetWeight`. */
  fallbackWeight?: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface WorkingSet {
  weight: number;
  reps: number;
  rpe: number | null;
}

interface Summary {
  date: Date;
  sets: WorkingSet[];
  eligible: boolean;
  topWeight: number;
  avgRpe: number | null;
}

function summarize(session: DprSession): Summary | null {
  const sets: WorkingSet[] = [];
  for (const set of session.sets) {
    if (set.kind !== "working" || set.weight === null || set.reps === null) continue;
    if (set.weight <= 0 || set.reps <= 0) continue;
    sets.push({ weight: set.weight, reps: set.reps, rpe: set.rpe });
  }
  if (sets.length === 0) return null;

  const eligible = sets.every((s) => s.rpe !== null);
  const avgRpe = eligible ? sets.reduce((sum, s) => sum + (s.rpe ?? 0), 0) / sets.length : null;
  return {
    date: session.date,
    sets,
    eligible,
    topWeight: Math.max(...sets.map((s) => s.weight)),
    avgRpe,
  };
}

function qualifies(s: Summary, range: RepRange, preset: DprPreset): boolean {
  return (
    s.avgRpe !== null && s.avgRpe <= preset.rpeCap && s.sets.every((set) => set.reps >= range.high)
  );
}

function isMiss(s: Summary, range: RepRange): boolean {
  return (s.avgRpe !== null && s.avgRpe >= MISS_RPE) || s.sets.some((set) => set.reps < range.low);
}

function formatNumber(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** "3×8 @ RPE 7.5", or "8/8/7 @ RPE 8" when the reps differ. */
function describe(s: Summary): string {
  const reps = s.sets.map((set) => set.reps);
  const repsText = reps.every((r) => r === reps[0]) ? `${reps.length}×${reps[0]}` : reps.join("/");
  return s.avgRpe === null ? repsText : `${repsText} @ RPE ${formatNumber(s.avgRpe)}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY_MS);
}

/** Count of newest-first entries matching `predicate`, stopping at the first that doesn't. */
function leadingCount<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  let count = 0;
  for (const item of items) {
    if (!predicate(item)) break;
    count++;
  }
  return count;
}

export function decideNextWeight(input: DecideInput): DprDecision {
  const { repRange, preset, increment, now } = input;
  const fallback = input.fallbackWeight ?? null;

  const summaries = input.sessions
    .map(summarize)
    .filter((s): s is Summary => s !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  if (summaries.length === 0) {
    return {
      call: "insufficient",
      weight: fallback,
      previousWeight: null,
      targetReps: fallback === null ? null : repRange.low,
      reason: "No history yet",
      streak: 0,
    };
  }

  const latest = summaries[0] as Summary;
  const eligible = summaries.filter((s) => s.eligible);
  const latestEligible = eligible[0];
  // Learn from what was actually lifted, including user overrides.
  const current = latestEligible?.topWeight ?? latest.topWeight;

  const gapDays = daysBetween(latest.date, now);
  const reentry = LAYOFF_REENTRY.find((r) => gapDays >= r.minDays);
  if (reentry) {
    return {
      call: "reenter",
      weight: roundToIncrement(current * (1 - reentry.pct), increment, "down"),
      previousWeight: current,
      targetReps: repRange.low,
      reason: `${gapDays} days off — easing back in ${Math.round(reentry.pct * 100)}%`,
      streak: 0,
    };
  }

  if (!latestEligible) {
    return {
      call: "insufficient",
      weight: latest.topWeight,
      previousWeight: latest.topWeight,
      targetReps: null,
      reason: "Add RPE for DPR",
      streak: 0,
    };
  }

  // Decisions only look at sessions the latest eligible weight was lifted at,
  // so a change of weight (an increase, a deload, an override) resets both
  // streaks.
  const contiguous = eligible.slice(
    0,
    leadingCount(eligible, (s) => s.topWeight === current),
  );
  const skippedNote = latest.eligible ? "" : " · Add RPE for DPR";

  const qualifyingStreak = leadingCount(contiguous, (s) => qualifies(s, repRange, preset));
  if (qualifyingStreak >= preset.qualifyingSessions) {
    const inARow = preset.qualifyingSessions > 1 ? ` (${qualifyingStreak} in a row)` : "";
    return {
      call: "increase",
      weight: roundToIncrement(current + jumpFor(current, preset, increment), increment),
      previousWeight: current,
      targetReps: repRange.low,
      reason: `Hit ${describe(latestEligible)}${inARow}${skippedNote}`,
      streak: qualifyingStreak,
    };
  }

  const missStreak = leadingCount(contiguous, (s) => isMiss(s, repRange));
  if (missStreak >= preset.deloadAfterMisses) {
    return {
      call: "deload",
      weight: roundToIncrement(current * (1 - DELOAD_PCT), increment, "down"),
      previousWeight: current,
      targetReps: repRange.low,
      reason: `Missed ${missStreak} in a row — deload ${Math.round(DELOAD_PCT * 100)}%${skippedNote}`,
      streak: missStreak,
    };
  }

  let reason: string;
  let streak: number;
  if (missStreak > 0) {
    reason = `Missed ${describe(latestEligible)} — holding (${missStreak}/${preset.deloadAfterMisses})`;
    streak = missStreak;
  } else if (qualifyingStreak > 0) {
    reason = `Hit ${describe(latestEligible)} — ${qualifyingStreak}/${preset.qualifyingSessions} to go up`;
    streak = qualifyingStreak;
  } else if (latestEligible.sets.every((s) => s.reps >= repRange.high)) {
    reason = `Hit ${describe(latestEligible)} — RPE over ${formatNumber(preset.rpeCap)} cap, holding`;
    streak = 0;
  } else {
    reason = `${describe(latestEligible)} — aim for ${repRange.high} on every set`;
    streak = 0;
  }
  return {
    call: "hold",
    weight: current,
    previousWeight: current,
    targetReps: null,
    reason: reason + skippedNote,
    streak,
  };
}

export interface DecisionLogEntry {
  /** The session the call was made after. */
  sessionDate: Date;
  decision: DprDecision;
}

/**
 * Replays history and returns the call DPR made after each session, newest
 * first. Each call is judged as of the next session's date (so a layoff
 * before it shows up as a re-entry), and the latest as of `now`.
 */
export function decisionLog(
  sessions: readonly DprSession[],
  options: Omit<DecideInput, "sessions">,
): DecisionLogEntry[] {
  const newestFirst = [...sessions].sort((a, b) => b.date.getTime() - a.date.getTime());
  const entries: DecisionLogEntry[] = [];
  for (let i = 0; i < newestFirst.length; i++) {
    const session = newestFirst[i] as DprSession;
    const next = newestFirst[i - 1];
    entries.push({
      sessionDate: session.date,
      decision: decideNextWeight({
        ...options,
        sessions: newestFirst.slice(i),
        now: next?.date ?? options.now,
      }),
    });
  }
  return entries;
}

export interface RoutineRepRangeSource {
  exerciseId: string;
  targetRepsLow: number | null;
  targetRepsHigh: number | null;
  /** When the owning routine was last updated — "most recent" is by this. */
  updatedAt: Date;
}

function rangeOf(source: {
  targetRepsLow: number | null;
  targetRepsHigh: number | null;
}): RepRange | null {
  const { targetRepsLow: low, targetRepsHigh: high } = source;
  if (low === null && high === null) return null;
  const lo = low ?? high ?? 0;
  const hi = high ?? low ?? 0;
  if (lo <= 0 || hi <= 0) return null;
  return { low: Math.min(lo, hi), high: Math.max(lo, hi) };
}

/**
 * The rep range DPR tracks a lift at: the routine being run's, else the most
 * recently updated routine containing the lift, else the DPR default (6–10,
 * or the user's own `defaultRange`).
 */
export function resolveRepRange(
  exerciseId: string,
  routineExercise?: { targetRepsLow: number | null; targetRepsHigh: number | null } | null,
  history: readonly RoutineRepRangeSource[] = [],
  defaultRange: RepRange = DPR_DEFAULT_REP_RANGE,
): RepRange {
  const own = routineExercise ? rangeOf(routineExercise) : null;
  if (own) return own;

  const recent = history
    .filter((h) => h.exerciseId === exerciseId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  for (const source of recent) {
    const range = rangeOf(source);
    if (range) return range;
  }
  return { low: defaultRange.low, high: defaultRange.high };
}

/** DPR state is kept per (exercise, rep range) — this is that key. */
export function dprStateKey(exerciseId: string, range: RepRange): string {
  return `${exerciseId}:${range.low}-${range.high}`;
}

export interface DprHistoryEntry extends DprSession {
  exerciseId: string;
  repRange: RepRange;
}

/** One (exercise, rep range)'s sessions, newest first. */
export function sessionsForKey(
  history: readonly DprHistoryEntry[],
  exerciseId: string,
  range: RepRange,
): DprSession[] {
  return history
    .filter(
      (h) =>
        h.exerciseId === exerciseId &&
        h.repRange.low === range.low &&
        h.repRange.high === range.high,
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(({ date, sets }) => ({ date, sets }));
}
