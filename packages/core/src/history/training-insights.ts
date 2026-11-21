import { MAX_ESTIMATE_REPS } from "../one-rep-max";
import { RPE_MAX } from "../sessions/rpe";

/**
 * Training-insight computations behind the MCP report tools (issue #860):
 * repeated targets (the same exercise, weight and reps across sessions) and
 * how their RPE moved, a split of each lift's e1RM change into weight, reps
 * and effort, a timeline of what explains a dip, and data-quality flags.
 * Pure, so the MCP and any later app screen read the same numbers.
 */

/** Effective reps (reps + reps in reserve) past this count no further toward the RPE-adjusted e1RM. */
export const RPE_ADJUSTED_MAX_REPS = 20;

/** The e1RM definitions, returned verbatim by every tool that reports one. */
export const E1RM_FORMULAS = {
  plain: {
    name: "Epley",
    formula: `weight × (1 + reps / 30), with reps capped at ${MAX_ESTIMATE_REPS}; a 1-rep set is its own weight`,
    repCap: MAX_ESTIMATE_REPS,
    note: "The estimated 1RM the app shows. Every set with weight and reps has one.",
  },
  rpeAdjusted: {
    name: "Epley on reps to failure",
    formula: `Epley with reps + reps in reserve, where reps in reserve = 10 − RPE (never negative), effective reps capped at ${RPE_ADJUSTED_MAX_REPS}`,
    repCap: RPE_ADJUSTED_MAX_REPS,
    note: "Reported by the MCP only. A set with no RPE has none, so it counts toward the plain e1RM alone.",
  },
} as const;

/** Unrounded Epley with a rep cap, matching `estimateOneRepMax` for a single. */
function epley(weight: number, reps: number, cap: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + Math.min(reps, cap) / 30);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Reps in reserve for an RPE (10 − RPE, never negative), or null without one. */
export function repsInReserveFromRpe(rpe: number | null | undefined): number | null {
  if (rpe == null || !Number.isFinite(rpe)) return null;
  return Math.max(0, RPE_MAX - rpe);
}

/** The app's plain e1RM, or null for a set without load or reps. */
export function plainOneRepMax(weight: number | null, reps: number | null): number | null {
  if (weight == null || reps == null || weight <= 0 || reps <= 0) return null;
  return round2(epley(weight, reps, MAX_ESTIMATE_REPS));
}

/** The RPE-adjusted e1RM (`E1RM_FORMULAS.rpeAdjusted`), or null without load, reps or RPE. */
export function rpeAdjustedOneRepMax(
  weight: number | null,
  reps: number | null,
  rpe: number | null,
): number | null {
  const reserve = repsInReserveFromRpe(rpe);
  if (reserve == null || weight == null || reps == null || weight <= 0 || reps <= 0) return null;
  return round2(epley(weight, reps + reserve, RPE_ADJUSTED_MAX_REPS));
}

/** Whether a set counts as a set to failure (CONTEXT.md): the failure kind, or RPE 10. */
export function isSetToFailure(set: { kind: string; rpe: number | null }): boolean {
  return set.kind === "failure" || set.rpe === RPE_MAX;
}

/** A resolved, live set as the insight computations read it. */
export interface InsightSet {
  id: string;
  sessionId: string;
  exerciseId: string;
  completedAt: Date;
  /** The user's local calendar day, YYYY-MM-DD. */
  localDate: string;
  kind: string;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
}

const mean = (values: readonly number[]) =>
  values.length === 0 ? null : round2(values.reduce((sum, v) => sum + v, 0) / values.length);

/** Whole days from one YYYY-MM-DD day to a later one. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Repeated targets
// ---------------------------------------------------------------------------

export interface RepeatedTargetSession {
  sessionId: string;
  localDate: string;
  setCount: number;
  /** Each set's RPE in order, null where none was logged. */
  rpes: (number | null)[];
  /** The mean of the logged RPEs, null when none was. */
  averageRpe: number | null;
  /** How many sets the average is drawn from. */
  rpeSetCount: number;
  bestPlainE1rm: number | null;
  bestRpeAdjustedE1rm: number | null;
  /** Days since this target's previous session; null for the first. */
  daysSincePrevious: number | null;
  /** Sick days strictly between the previous session and this one. */
  sickDaysSincePrevious: number;
}

export interface RepeatedTarget {
  exerciseId: string;
  /** 0 for a bodyweight set logged without load. */
  weight: number;
  reps: number;
  sessionCount: number;
  firstRpe: number | null;
  lastRpe: number | null;
  /** lastRpe − firstRpe; negative means the target got easier. Null without two RPEs. */
  rpeChange: number | null;
  sessions: RepeatedTargetSession[];
}

export interface RepeatedTargetOptions {
  /** Targets repeated in fewer sessions than this are left out (default 2). */
  minSessions?: number;
  /** Count warm-up sets too (default false). */
  includeWarmups?: boolean;
  /** Sick days (YYYY-MM-DD), so a gap across them is visible. */
  sickDays?: readonly string[];
}

/**
 * Groups sets by exercise, weight and reps, one entry per session, and
 * ranks the targets by how their RPE moved (easiest-getting first; no
 * change last). Sets without reps are left out.
 */
export function repeatedTargetTrends(
  sets: readonly InsightSet[],
  options: RepeatedTargetOptions = {},
): RepeatedTarget[] {
  const minSessions = options.minSessions ?? 2;
  const sick = [...(options.sickDays ?? [])].sort();
  const groups = new Map<string, InsightSet[]>();
  for (const set of sets) {
    if (!options.includeWarmups && set.kind === "warmup") continue;
    if (set.reps == null || set.reps <= 0) continue;
    const weight = set.weight ?? 0;
    const key = `${set.exerciseId}|${weight}|${set.reps}`;
    const list = groups.get(key) ?? [];
    list.push(set);
    groups.set(key, list);
  }

  const targets: RepeatedTarget[] = [];
  for (const list of groups.values()) {
    const bySession = new Map<string, InsightSet[]>();
    for (const set of [...list].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())) {
      const entry = bySession.get(set.sessionId) ?? [];
      entry.push(set);
      bySession.set(set.sessionId, entry);
    }
    if (bySession.size < minSessions) continue;

    const sessions: RepeatedTargetSession[] = [];
    let previous: string | null = null;
    for (const [sessionId, sessionSets] of bySession) {
      const first = sessionSets[0] as InsightSet;
      const logged = sessionSets.map((s) => s.rpe).filter((r): r is number => r != null);
      const plain = sessionSets.map((s) => plainOneRepMax(s.weight, s.reps) ?? -1);
      const adjusted = sessionSets.map((s) => rpeAdjustedOneRepMax(s.weight, s.reps, s.rpe) ?? -1);
      const bestPlain = Math.max(...plain);
      const bestAdjusted = Math.max(...adjusted);
      const prev: string | null = previous;
      sessions.push({
        sessionId,
        localDate: first.localDate,
        setCount: sessionSets.length,
        rpes: sessionSets.map((s) => s.rpe),
        averageRpe: mean(logged),
        rpeSetCount: logged.length,
        bestPlainE1rm: bestPlain < 0 ? null : bestPlain,
        bestRpeAdjustedE1rm: bestAdjusted < 0 ? null : bestAdjusted,
        daysSincePrevious: prev == null ? null : daysBetween(prev, first.localDate),
        sickDaysSincePrevious:
          prev == null ? 0 : sick.filter((day) => day > prev && day < first.localDate).length,
      });
      previous = first.localDate;
    }

    const withRpe = sessions.filter((s) => s.averageRpe != null);
    const firstRpe = withRpe[0]?.averageRpe ?? null;
    const lastRpe = withRpe.length > 1 ? (withRpe[withRpe.length - 1]?.averageRpe ?? null) : null;
    const sample = list[0] as InsightSet;
    targets.push({
      exerciseId: sample.exerciseId,
      weight: sample.weight ?? 0,
      reps: sample.reps as number,
      sessionCount: sessions.length,
      firstRpe,
      lastRpe,
      rpeChange: firstRpe != null && lastRpe != null ? round2(lastRpe - firstRpe) : null,
      sessions,
    });
  }

  return targets.sort((a, b) => {
    if (a.rpeChange == null && b.rpeChange == null) return b.sessionCount - a.sessionCount;
    if (a.rpeChange == null) return 1;
    if (b.rpeChange == null) return -1;
    return a.rpeChange - b.rpeChange || b.sessionCount - a.sessionCount;
  });
}

// ---------------------------------------------------------------------------
// Progress decomposition
// ---------------------------------------------------------------------------

export interface DecompositionPoint {
  sessionId: string;
  localDate: string;
  weight: number;
  reps: number;
  rpe: number | null;
  e1rm: number;
}

export type ProgressDriver = "weight" | "reps" | "effort" | "none";

export type ProgressDecomposition =
  | {
      exerciseId: string;
      status: "ok";
      /** "rpe_adjusted" when both ends have an RPE; else "plain", with no effort part. */
      basis: "rpe_adjusted" | "plain";
      sessions: number;
      first: DecompositionPoint;
      last: DecompositionPoint;
      change: number;
      /** The three parts add up to `change`. */
      parts: { weight: number; reps: number; effort: number | null };
      dominant: ProgressDriver;
    }
  | {
      exerciseId: string;
      status: "insufficient_data";
      sessions: number;
      reason: string;
    };

interface SessionBest {
  sessionId: string;
  localDate: string;
  set: InsightSet;
  e1rm: number;
}

function bestPerSession(
  sets: readonly InsightSet[],
  score: (set: InsightSet) => number | null,
): SessionBest[] {
  const best = new Map<string, SessionBest>();
  for (const set of sets) {
    const e1rm = score(set);
    if (e1rm == null) continue;
    const kept = best.get(set.sessionId);
    if (!kept || e1rm > kept.e1rm) {
      best.set(set.sessionId, { sessionId: set.sessionId, localDate: set.localDate, set, e1rm });
    }
  }
  return [...best.values()].sort(
    (a, b) => a.set.completedAt.getTime() - b.set.completedAt.getTime(),
  );
}

function point(best: SessionBest): DecompositionPoint {
  return {
    sessionId: best.sessionId,
    localDate: best.localDate,
    weight: best.set.weight as number,
    reps: best.set.reps as number,
    rpe: best.set.rpe,
    e1rm: best.e1rm,
  };
}

/**
 * For each exercise, splits the change in its best e1RM from the first to
 * the last session into a weight part (new weight at the old reps and
 * effort), a reps part (new reps at the old effort) and an effort part
 * (lower or higher RPE at the new weight and reps). Warm-ups are left out.
 */
export function progressDecomposition(sets: readonly InsightSet[]): ProgressDecomposition[] {
  const byExercise = new Map<string, InsightSet[]>();
  for (const set of sets) {
    if (set.kind === "warmup") continue;
    const list = byExercise.get(set.exerciseId) ?? [];
    list.push(set);
    byExercise.set(set.exerciseId, list);
  }

  const results: ProgressDecomposition[] = [];
  for (const [exerciseId, list] of byExercise) {
    const sessionCount = new Set(list.map((set) => set.sessionId)).size;
    const plain = bestPerSession(list, (set) => plainOneRepMax(set.weight, set.reps));
    if (plain.length < 2) {
      results.push({
        exerciseId,
        status: "insufficient_data",
        sessions: plain.length > 0 ? plain.length : sessionCount,
        reason:
          plain.length === 0
            ? "No sets with weight and reps in this range (a bodyweight lift logged without load has no e1RM)."
            : "Needs at least two sessions with weight and reps in this range.",
      });
      continue;
    }

    const adjusted = bestPerSession(list, (set) =>
      rpeAdjustedOneRepMax(set.weight, set.reps, set.rpe),
    );
    const firstPlain = plain[0] as SessionBest;
    const lastPlain = plain[plain.length - 1] as SessionBest;
    const firstAdjusted = adjusted[0];
    const lastAdjusted = adjusted[adjusted.length - 1];
    const useAdjusted =
      firstAdjusted !== undefined &&
      lastAdjusted !== undefined &&
      firstAdjusted.sessionId === firstPlain.sessionId &&
      lastAdjusted.sessionId === lastPlain.sessionId;

    const first = useAdjusted ? firstAdjusted : firstPlain;
    const last = useAdjusted ? (lastAdjusted as SessionBest) : lastPlain;
    const w0 = first.set.weight as number;
    const w1 = last.set.weight as number;
    const r0 = first.set.reps as number;
    const r1 = last.set.reps as number;
    const cap = useAdjusted ? RPE_ADJUSTED_MAX_REPS : MAX_ESTIMATE_REPS;
    const rir0 = useAdjusted ? (repsInReserveFromRpe(first.set.rpe) ?? 0) : 0;
    const rir1 = useAdjusted ? (repsInReserveFromRpe(last.set.rpe) ?? 0) : 0;

    // Telescoping steps, so the parts add up to the whole change exactly.
    const start = epley(w0, r0 + rir0, cap);
    const afterWeight = epley(w1, r0 + rir0, cap);
    const afterReps = epley(w1, r1 + rir0, cap);
    const end = epley(w1, r1 + rir1, cap);
    const parts = {
      weight: round2(afterWeight - start),
      reps: round2(afterReps - afterWeight),
      effort: useAdjusted ? round2(end - afterReps) : null,
    };
    const change = round2(end - start);
    const ranked = (
      [
        ["weight", parts.weight],
        ["reps", parts.reps],
        ["effort", parts.effort ?? 0],
      ] as const
    )
      .map(([name, value]) => [name, Math.abs(value)] as const)
      .sort((a, b) => b[1] - a[1]);
    const top = ranked[0] as readonly [ProgressDriver, number];

    results.push({
      exerciseId,
      status: "ok",
      basis: useAdjusted ? "rpe_adjusted" : "plain",
      sessions: plain.length,
      first: point(first),
      last: point(last),
      change,
      parts,
      dominant: top[1] === 0 ? "none" : top[0],
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Training context
// ---------------------------------------------------------------------------

export interface ContextWorkout {
  sessionId: string;
  localDate: string;
  gymId: string | null;
  gymName: string | null;
}

export interface WorkoutGap {
  /** The last workout before the gap. */
  from: string;
  /** The first workout after it. */
  to: string;
  /** Whole days between the two workouts. */
  days: number;
  sickDays: number;
}

/** Gaps between consecutive workouts longer than `gapDays` days (layoffs). */
export function workoutGaps(
  workoutDays: readonly string[],
  gapDays: number,
  sickDays: readonly string[] = [],
): WorkoutGap[] {
  const days = [...new Set(workoutDays)].sort();
  const gaps: WorkoutGap[] = [];
  for (let i = 1; i < days.length; i++) {
    const from = days[i - 1] as string;
    const to = days[i] as string;
    const length = daysBetween(from, to);
    if (length > gapDays) {
      gaps.push({
        from,
        to,
        days: length,
        sickDays: sickDays.filter((day) => day > from && day < to).length,
      });
    }
  }
  return gaps;
}

export interface GymChange {
  localDate: string;
  sessionId: string;
  fromGym: string | null;
  toGym: string | null;
}

/** Each workout whose gym differs from the workout before it. Workouts come oldest first. */
export function gymChanges(workouts: readonly ContextWorkout[]): GymChange[] {
  const changes: GymChange[] = [];
  for (let i = 1; i < workouts.length; i++) {
    const before = workouts[i - 1] as ContextWorkout;
    const now = workouts[i] as ContextWorkout;
    if (before.gymId !== now.gymId) {
      changes.push({
        localDate: now.localDate,
        sessionId: now.sessionId,
        fromGym: before.gymName,
        toGym: now.gymName,
      });
    }
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Data quality
// ---------------------------------------------------------------------------

export interface RapidSetFlag {
  sessionId: string;
  localDate: string;
  exerciseId: string;
  setIds: [string, string];
  secondsApart: number;
}

/**
 * Pairs of consecutive sets in one workout completed less than
 * `thresholdSeconds` apart: logged after the fact, so their RPE is a guess.
 */
export function rapidSetFlags(
  sets: readonly InsightSet[],
  thresholdSeconds: number,
): RapidSetFlag[] {
  const bySession = new Map<string, InsightSet[]>();
  for (const set of sets) {
    const list = bySession.get(set.sessionId) ?? [];
    list.push(set);
    bySession.set(set.sessionId, list);
  }
  const flags: RapidSetFlag[] = [];
  for (const list of bySession.values()) {
    const ordered = [...list].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
    for (let i = 1; i < ordered.length; i++) {
      const before = ordered[i - 1] as InsightSet;
      const now = ordered[i] as InsightSet;
      const seconds = (now.completedAt.getTime() - before.completedAt.getTime()) / 1000;
      if (seconds < thresholdSeconds) {
        flags.push({
          sessionId: now.sessionId,
          localDate: now.localDate,
          exerciseId: now.exerciseId,
          setIds: [before.id, now.id],
          secondsApart: Math.round(seconds * 10) / 10,
        });
      }
    }
  }
  return flags;
}
