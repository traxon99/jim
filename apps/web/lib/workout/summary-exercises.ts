import type { SessionDetailExercise, SessionDetailSet } from "@/lib/history/session-detail-entries";
import {
  type DistanceUnit,
  type PrKind,
  cardioKindOf,
  cardioProfile,
  formatCardioSetFor,
  formatTimedSet,
} from "@jim/core";

/** Short chip labels for each PR kind, shared with session detail. */
export const PR_KIND_LABELS: Record<PrKind, string> = {
  "1rm": "e1RM",
  weight: "Weight",
  volume: "Volume",
  reps_at_weight: "Reps",
};

export interface SummaryExerciseRow {
  sessionExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  /** Non-warm-up sets, or every set when the exercise only has warm-ups. */
  setCount: number;
  /** "185 × 5", "× 12", "45s", "5 km · 25:00" — the exercise's best set, or "—". */
  bestSet: string;
  /**
   * Every counted set on one line (issue #870): "195 × 8, 8, 7", or
   * "185 × 8, 8 · 195 × 6" when the weight changes. Timed and cardio
   * exercises fall back to their best set.
   */
  setsLine: string;
  /** Distinct PR kinds hit by any set of the exercise, in first-hit order. */
  prKinds: PrKind[];
  /** The tempo the workout used (issue #845), "3-1-1", or null. */
  tempo: string | null;
}

function isBetter(candidate: SessionDetailSet, best: SessionDetailSet): boolean {
  // Cardio (issue #423): the longest distance, then the longest time.
  if ((candidate.distance ?? 0) !== (best.distance ?? 0)) {
    return (candidate.distance ?? 0) > (best.distance ?? 0);
  }
  if ((candidate.weight ?? 0) !== (best.weight ?? 0)) {
    return (candidate.weight ?? 0) > (best.weight ?? 0);
  }
  if ((candidate.reps ?? 0) !== (best.reps ?? 0)) return (candidate.reps ?? 0) > (best.reps ?? 0);
  return (candidate.durationSeconds ?? 0) > (best.durationSeconds ?? 0);
}

function formatSet(set: SessionDetailSet, unit: DistanceUnit, exerciseName = ""): string {
  // A cardio set reads in its sport's units (issue #872): a row in meters.
  if (set.distance != null && set.reps == null && !(set.weight != null && set.weight > 0)) {
    return formatCardioSetFor(set, unit, cardioProfile(cardioKindOf({ name: exerciseName })));
  }
  if (set.weight != null && set.weight > 0) {
    return set.reps != null ? `${set.weight} × ${set.reps}` : `${set.weight}`;
  }
  if (set.reps != null) return `× ${set.reps}`;
  return formatTimedSet(set, unit) ?? "—";
}

function formatWeight(weight: number): string {
  return String(Math.round(weight * 100) / 100);
}

/** "195 × 8, 8, 7", consecutive sets at one weight sharing it; null for timed or cardio sets. */
export function formatSetsLine(sets: readonly SessionDetailSet[]): string | null {
  if (sets.length === 0 || sets.some((set) => set.reps == null || set.distance != null))
    return null;
  const runs: { weight: number | null; reps: number[] }[] = [];
  for (const set of sets) {
    const weight = set.weight != null && set.weight > 0 ? set.weight : null;
    const last = runs[runs.length - 1];
    if (last && last.weight === weight) last.reps.push(set.reps as number);
    else runs.push({ weight, reps: [set.reps as number] });
  }
  return runs
    .map(
      (run) =>
        `${run.weight == null ? "" : `${formatWeight(run.weight)} `}× ${run.reps.join(", ")}`,
    )
    .join(" · ");
}

/**
 * The condensed per-exercise list on the post-workout summary (issue #185):
 * one row per exercise that has logged sets, with its best set — heaviest,
 * then most reps — and any PRs it hit, so the summary reads at a glance
 * without opening the full session detail.
 */
export function buildSummaryExerciseRows(
  groups: readonly SessionDetailExercise[],
  distanceUnit: DistanceUnit = "mi",
): SummaryExerciseRow[] {
  const rows: SummaryExerciseRow[] = [];
  for (const group of groups) {
    if (group.sets.length === 0) continue;
    const working = group.sets.filter((set) => set.kind !== "warmup");
    const counted = working.length > 0 ? working : group.sets;
    let best = counted[0];
    for (const set of counted) {
      if (isBetter(set, best)) best = set;
    }
    const prKinds: PrKind[] = [];
    for (const set of group.sets) {
      for (const kind of set.prKinds) {
        if (!prKinds.includes(kind)) prKinds.push(kind);
      }
    }
    rows.push({
      sessionExerciseId: group.sessionExerciseId,
      exerciseId: group.exerciseId,
      exerciseName: group.exerciseName,
      setCount: counted.length,
      bestSet: formatSet(best, distanceUnit, group.exerciseName),
      setsLine: formatSetsLine(counted) ?? formatSet(best, distanceUnit, group.exerciseName),
      prKinds,
      tempo: group.tempo,
    });
  }
  return rows;
}
