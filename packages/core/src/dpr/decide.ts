import { isShortRest } from "../sessions/rest-compliance";
import { rpeAdjustedE1rm } from "./e1rm";
import { jumpFor, roundToIncrement } from "./equipment-increments";
import {
  DELOAD_PCT,
  DPR_DEFAULT_REP_RANGE,
  type DprPreset,
  LAYOFF_REENTRY,
  MISS_RPE,
  OUTPERFORM_MAX_JUMP_PCT,
  OUTPERFORM_RPE_MARGIN,
  RPE_ABNORMAL_POINTS,
  RPE_BASELINE_SESSIONS,
  SHORT_REST_RPE_CREDIT,
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
  /** Rest taken before this set and its target (issue #233); absent = unknown. */
  restSeconds?: number | null;
  restTargetSeconds?: number | null;
}

/** The "how hard today?" pick for a session (issue #235). */
export type SessionIntensity = "light" | "maintain" | "push";

export interface DprSession {
  date: Date;
  sets: readonly DprSet[];
  /** A "light" session never counts toward or against progression. */
  intensity?: SessionIntensity | null;
}

export interface RepRange {
  low: number;
  high: number;
}

/** "light" only comes from `applyIntensity` — the engine itself never calls it. */
export type DprCall = "increase" | "hold" | "deload" | "reenter" | "light" | "insufficient";

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
  shortRest: boolean;
}

/** How a session's RPE compares with what its history expects (issue #385). */
type RpeCheck = "normal" | "low" | "high";

interface Summary {
  date: Date;
  sets: WorkingSet[];
  /**
   * The working sets at the top weight. With ramped sets (issue #385) the
   * lighter lead-in sets don't say whether the top weight is moving, so
   * qualifying, missing and RPE are all judged from these.
   */
  topSets: WorkingSet[];
  eligible: boolean;
  topWeight: number;
  /** The top sets' average RPE as judged — history's expectation when the logged one looks too low. */
  avgRpe: number | null;
  /** The top sets' average RPE as logged. */
  loggedRpe: number | null;
  rpeCheck: RpeCheck;
  /** Any working set started on a short rest (issue #233). */
  shortRest: boolean;
  light: boolean;
}

function summarize(session: DprSession): Summary | null {
  const sets: WorkingSet[] = [];
  for (const set of session.sets) {
    if (set.kind !== "working" || set.weight === null || set.reps === null) continue;
    if (set.weight <= 0 || set.reps <= 0) continue;
    sets.push({
      weight: set.weight,
      reps: set.reps,
      rpe: set.rpe,
      shortRest: isShortRest(set.restSeconds, set.restTargetSeconds),
    });
  }
  if (sets.length === 0) return null;

  const topWeight = Math.max(...sets.map((s) => s.weight));
  const topSets = sets.filter((s) => s.weight === topWeight);
  const eligible = topSets.every((s) => s.rpe !== null);
  const avgRpe = eligible
    ? topSets.reduce((sum, s) => sum + (s.rpe ?? 0), 0) / topSets.length
    : null;
  return {
    date: session.date,
    sets,
    topSets,
    eligible,
    topWeight,
    avgRpe,
    loggedRpe: avgRpe,
    rpeCheck: "normal",
    shortRest: sets.some((s) => s.shortRest),
    light: session.intensity === "light",
  };
}

/** Rest compliance (issue #233): short rests earn some RPE headroom. */
function rpeCapFor(s: Summary, preset: DprPreset): number {
  return preset.rpeCap + (s.shortRest ? SHORT_REST_RPE_CREDIT : 0);
}

function qualifies(s: Summary, range: RepRange, preset: DprPreset): boolean {
  return (
    s.rpeCheck !== "high" &&
    s.avgRpe !== null &&
    s.avgRpe <= rpeCapFor(s, preset) &&
    s.topSets.every((set) => set.reps >= range.high)
  );
}

/**
 * A missed rep target only counts when the set had its full rest — coming
 * up short after a skipped rest says more about the rest than the weight.
 */
function isMiss(s: Summary, range: RepRange): boolean {
  // An RPE well over what history expects reads as a one-off (or a
  // mislog), not a sign the weight is too heavy (issue #385).
  if (s.rpeCheck === "high") return false;
  return (
    (s.avgRpe !== null && s.avgRpe >= MISS_RPE) ||
    s.topSets.some((set) => set.reps < range.low && !set.shortRest)
  );
}

/** The best RPE-adjusted e1RM among a session's top sets, at its judged RPE. */
function summaryE1rm(s: Summary): number {
  return Math.max(...s.topSets.map((set) => rpeAdjustedE1rm(set.weight, set.reps, s.avgRpe)));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * The RPE a session's top sets "should" have been at, from an e1RM: a set
 * of `reps` at `weight` leaves (reps to failure − reps) in reserve, with
 * reps to failure from inverting Epley. Over 10 means the load beat what
 * history says is possible.
 */
function expectedRpe(s: Summary, e1rm: number): number {
  const total = s.topSets.reduce((sum, set) => {
    const toFailure = 30 * (e1rm / set.weight - 1);
    return sum + 10 - (toFailure - set.reps);
  }, 0);
  return total / s.topSets.length;
}

/**
 * RPE sanity check (issue #385), on newest-first eligible summaries: each
 * session's logged RPE is compared with what the median e1RM of the
 * sessions just before it expects. Far too low — while the load itself is
 * within what history supports — and the session is judged at the
 * expected RPE instead; far too high and it's flagged so it neither
 * qualifies nor counts as a miss. A load that beats history is never
 * "too low": that's the lifter getting stronger.
 */
function checkRpe(eligible: Summary[]): Summary[] {
  // Oldest first, so each baseline is built from already-checked sessions.
  const checked: Summary[] = [];
  for (const s of [...eligible].reverse()) {
    const prior = checked.slice(-RPE_BASELINE_SESSIONS);
    if (prior.length < 2 || s.loggedRpe === null) {
      checked.push(s);
      continue;
    }
    const expected = expectedRpe(s, median(prior.map(summaryE1rm)));
    if (expected <= 10 && expected - s.loggedRpe >= RPE_ABNORMAL_POINTS) {
      checked.push({ ...s, avgRpe: Math.round(expected * 2) / 2, rpeCheck: "low" });
    } else if (s.loggedRpe - expected >= RPE_ABNORMAL_POINTS) {
      checked.push({ ...s, rpeCheck: "high" });
    } else {
      checked.push(s);
    }
  }
  return checked.reverse();
}

function formatNumber(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/**
 * "3×8 @ RPE 7.5", or "8/8/7 @ RPE 8" when the reps differ; with ramped
 * sets, the top sets with their weight, e.g. "1×8 @ 190, RPE 8".
 */
function describe(s: Summary): string {
  const reps = s.topSets.map((set) => set.reps);
  const ramped = s.topSets.length < s.sets.length;
  let repsText = reps.every((r) => r === reps[0]) ? `${reps.length}×${reps[0]}` : reps.join("/");
  if (ramped) repsText += ` @ ${formatNumber(s.topWeight)}`;
  const rpeText = s.loggedRpe === null ? "" : `RPE ${formatNumber(s.loggedRpe)}`;
  const text = rpeText === "" ? repsText : `${repsText}${ramped ? ", " : " @ "}${rpeText}`;
  return s.shortRest ? `${text} on short rest` : text;
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

/** A note on the latest session's RPE when it looked off for its load (issue #385). */
function rpeNote(s: Summary): string {
  if (s.rpeCheck === "low") {
    return ` · RPE ${formatNumber(s.loggedRpe ?? 0)} looks low for this load, judged as ${formatNumber(s.avgRpe ?? 0)}`;
  }
  if (s.rpeCheck === "high")
    return ` · RPE ${formatNumber(s.loggedRpe ?? 0)} looks high vs your history`;
  return "";
}

/**
 * Outperforming DPR (issue #385): the latest session beat the weight DPR
 * suggested for it (by at least a step, at the bottom of the range or
 * better, or at it with reps past the top of the range) at an RPE well
 * under the preset's cap. History is underestimating the lifter, so the
 * next weight comes from what the session itself shows: the weight that
 * e1RM puts the bottom of the range at the preset's RPE cap, at least a
 * normal jump and at most OUTPERFORM_MAX_JUMP_PCT over what was lifted.
 */
function outperformance(
  latest: Summary,
  input: DecideInput,
): { suggested: number; weight: number } | null {
  const { repRange, preset, increment } = input;
  if (latest.rpeCheck !== "normal" || latest.avgRpe === null) return null;
  if (latest.avgRpe > preset.rpeCap - OUTPERFORM_RPE_MARGIN) return null;

  // What DPR suggested going into that session. The replay skips its own
  // outperformance check — one level is enough to know what was suggested.
  const before = decideCore(
    {
      ...input,
      sessions: input.sessions.filter((s) => s.date < latest.date),
      now: latest.date,
      fallbackWeight: null,
    },
    false,
  );
  if (before.call === "insufficient" || before.weight === null) return null;
  const suggested = before.weight;

  const top = latest.topWeight;
  const heavier =
    top >= suggested + increment && latest.topSets.every((set) => set.reps >= repRange.low);
  const moreReps = top >= suggested && latest.topSets.every((set) => set.reps > repRange.high);
  if (!heavier && !moreReps) return null;

  const target = summaryE1rm(latest) / (1 + (repRange.low + (10 - preset.rpeCap)) / 30);
  const floor = roundToIncrement(top + jumpFor(top, preset, increment), increment);
  const ceiling = roundToIncrement(top * (1 + OUTPERFORM_MAX_JUMP_PCT), increment, "down");
  const weight = Math.max(floor, Math.min(ceiling, roundToIncrement(target, increment, "down")));
  return { suggested, weight };
}

export function decideNextWeight(input: DecideInput): DprDecision {
  return decideCore(input, true);
}

function decideCore(input: DecideInput, detectOutperformance: boolean): DprDecision {
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

  // A light day (issue #235) still counts as training for layoff purposes,
  // but decisions are made from the other sessions, so going light can't
  // reset a streak or drag the working weight down.
  const latest = summaries[0] as Summary;
  const decisive = summaries.some((s) => !s.light) ? summaries.filter((s) => !s.light) : summaries;
  const latestDecisive = decisive[0] as Summary;
  const eligible = checkRpe(decisive.filter((s) => s.eligible));
  const latestEligible = eligible[0];
  // Learn from what was actually lifted, including user overrides.
  const current = latestEligible?.topWeight ?? latestDecisive.topWeight;

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
      weight: latestDecisive.topWeight,
      previousWeight: latestDecisive.topWeight,
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
  const skippedNote = latestDecisive.eligible ? "" : " · Add RPE for DPR";
  const note = rpeNote(latestEligible) + skippedNote;

  const outperformed = detectOutperformance ? outperformance(latestEligible, input) : null;
  if (outperformed) {
    return {
      call: "increase",
      weight: outperformed.weight,
      previousWeight: current,
      targetReps: repRange.low,
      reason: `Beat DPR's ${formatNumber(outperformed.suggested)} with ${describe(latestEligible)} — stronger than your history shows${skippedNote}`,
      streak: 1,
    };
  }

  const qualifyingStreak = leadingCount(contiguous, (s) => qualifies(s, repRange, preset));
  if (qualifyingStreak >= preset.qualifyingSessions) {
    const inARow = preset.qualifyingSessions > 1 ? ` (${qualifyingStreak} in a row)` : "";
    return {
      call: "increase",
      weight: roundToIncrement(current + jumpFor(current, preset, increment), increment),
      previousWeight: current,
      targetReps: repRange.low,
      reason: `Hit ${describe(latestEligible)}${inARow}${note}`,
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
      reason: `Missed ${missStreak} in a row — deload ${Math.round(DELOAD_PCT * 100)}%${note}`,
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
  } else if (latestEligible.rpeCheck === "high") {
    reason = `${describe(latestEligible)} — RPE looks high vs your history, holding`;
    streak = 0;
  } else if (latestEligible.topSets.every((s) => s.reps >= repRange.high)) {
    reason = `Hit ${describe(latestEligible)} — RPE over ${formatNumber(rpeCapFor(latestEligible, preset))} cap, holding`;
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
    reason:
      reason + (latestEligible.rpeCheck === "high" ? "" : rpeNote(latestEligible)) + skippedNote,
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
    .map(({ date, sets, intensity }) => ({ date, sets, intensity }));
}
