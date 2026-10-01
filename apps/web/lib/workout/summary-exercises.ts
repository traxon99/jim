import type { SessionDetailExercise, SessionDetailSet } from "@/lib/history/session-detail-entries";
import type { PrKind } from "@jim/core";

/** Short chip labels for each PR kind, shared with session detail. */
export const PR_KIND_LABELS: Record<PrKind, string> = {
  "1rm": "1RM",
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
  /** "185 × 5", "× 12", "60s" — the exercise's best set, or "—". */
  bestSet: string;
  /** Distinct PR kinds hit by any set of the exercise, in first-hit order. */
  prKinds: PrKind[];
}

function isBetter(candidate: SessionDetailSet, best: SessionDetailSet): boolean {
  if ((candidate.weight ?? 0) !== (best.weight ?? 0)) {
    return (candidate.weight ?? 0) > (best.weight ?? 0);
  }
  if ((candidate.reps ?? 0) !== (best.reps ?? 0)) return (candidate.reps ?? 0) > (best.reps ?? 0);
  if ((candidate.durationSeconds ?? 0) !== (best.durationSeconds ?? 0)) {
    return (candidate.durationSeconds ?? 0) > (best.durationSeconds ?? 0);
  }
  return (candidate.distance ?? 0) > (best.distance ?? 0);
}

function formatSet(set: SessionDetailSet): string {
  if (set.weight != null && set.weight > 0) {
    return set.reps != null ? `${set.weight} × ${set.reps}` : `${set.weight}`;
  }
  if (set.reps != null) return `× ${set.reps}`;
  if (set.durationSeconds != null) return `${set.durationSeconds}s`;
  if (set.distance != null) return `${set.distance}`;
  return "—";
}

/**
 * The condensed per-exercise list on the post-workout summary (issue #185):
 * one row per exercise that has logged sets, with its best set — heaviest,
 * then most reps — and any PRs it hit, so the summary reads at a glance
 * without opening the full session detail.
 */
export function buildSummaryExerciseRows(
  groups: readonly SessionDetailExercise[],
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
      bestSet: formatSet(best),
      prKinds,
    });
  }
  return rows;
}
