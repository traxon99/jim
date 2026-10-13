/**
 * Estimated one-rep-max formula shared across the PWA, the sync API, and the
 * MCP server, so a number shown on the phone and a number reported by Claude
 * cannot drift (see docs/ARCHITECTURE.md §4, "Shared computation").
 */

/**
 * Reps past this count no further toward an estimate (issue #538). Epley is
 * reasonable up to ~10–15 reps; beyond that it keeps climbing, so 20 kg × 50
 * read as a 53 kg "1RM" and beat a real 50 kg single as a PR.
 */
export const MAX_ESTIMATE_REPS = 15;

/** Epley formula: 1RM = weight * (1 + reps / 30). */
function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

export interface EstimateOneRepMaxOptions {
  /**
   * Overrides `MAX_ESTIMATE_REPS`. PRP passes Infinity: it compares a lift's
   * estimates with each other, where a capped value would hide progress on
   * high-rep work.
   */
  maxReps?: number;
}

/**
 * Estimates a one-rep max from a single set's weight and reps.
 *
 * Returns the raw weight unchanged for a 1-rep set, and 0 for a
 * non-positive weight or rep count.
 */
export function estimateOneRepMax(
  weight: number,
  reps: number,
  options: EstimateOneRepMaxOptions = {},
): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;

  const raw = epley(weight, Math.min(reps, options.maxReps ?? MAX_ESTIMATE_REPS));
  return Math.round(raw * 100) / 100;
}
