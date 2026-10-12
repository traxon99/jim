export interface SessionSummarySet {
  weight: number | null;
  reps: number | null;
  /** Warm-up sets count toward neither volume nor sets (issue #494). */
  kind?: string;
}

export interface SessionSummary {
  /** Sum of weight * reps across every working set with both (docs/ARCHITECTURE.md §4). */
  totalVolume: number;
  durationSeconds: number;
  setCount: number;
  prCount: number;
}

/**
 * Rolls up a finished session's sets (already resolved to their current,
 * non-deleted version) into the numbers shown on the finalize screen.
 * `startedAt`/`endedAt` come from the session row itself rather than the
 * sets, since a session can be finalized with zero sets logged.
 */
export function summarizeSession(
  sets: readonly SessionSummarySet[],
  startedAt: Date,
  endedAt: Date,
  prCount = 0,
): SessionSummary {
  // Working sets only, like volume by muscle and weekly_summary (LESSONS #395).
  const working = sets.filter((set) => set.kind !== "warmup");
  let totalVolume = 0;
  for (const set of working) {
    if (set.weight != null && set.reps != null) {
      totalVolume += set.weight * set.reps;
    }
  }

  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));

  return { totalVolume, durationSeconds, setCount: working.length, prCount };
}
