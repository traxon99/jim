import { type EstimateOneRepMaxOptions, estimateOneRepMax } from "../one-rep-max";

export interface EstimatedOneRepMaxSet {
  sessionId: string;
  completedAt: Date;
  weight: number | null;
  reps: number | null;
}

export interface OneRepMaxPoint {
  date: Date;
  sessionId: string;
  estimatedOneRepMax: number;
}

/**
 * "Per-exercise history with an estimated-1RM-over-time chart" (STORIES.md
 * S7) — one point per session rather than per set: the best estimated 1RM
 * among that session's sets for the exercise, so a 5x5 day doesn't plot as
 * five near-identical points. Callers pass already-resolved, non-deleted
 * sets (`resolveCurrentRows`) for a single exercise. Sorted oldest first,
 * the natural order for a time-series chart.
 */
export function estimatedOneRepMaxSeries(
  sets: readonly EstimatedOneRepMaxSet[],
  options: EstimateOneRepMaxOptions = {},
): OneRepMaxPoint[] {
  const bestBySession = new Map<string, OneRepMaxPoint>();

  for (const set of sets) {
    if (set.weight == null || set.reps == null || set.weight <= 0 || set.reps <= 0) continue;

    const value = estimateOneRepMax(set.weight, set.reps, options);
    const existing = bestBySession.get(set.sessionId);
    if (!existing || value > existing.estimatedOneRepMax) {
      bestBySession.set(set.sessionId, {
        date: set.completedAt,
        sessionId: set.sessionId,
        estimatedOneRepMax: value,
      });
    }
  }

  return [...bestBySession.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}
