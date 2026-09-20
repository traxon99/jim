/**
 * Estimated one-rep-max formulas shared across the PWA, the sync API, and the
 * MCP server, so a number shown on the phone and a number reported by Claude
 * cannot drift (see docs/ARCHITECTURE.md §4, "Shared computation").
 */

export type OneRepMaxFormula = "epley" | "brzycki";

/**
 * Epley formula: 1RM = weight * (1 + reps / 30)
 * The default — simple, and reasonably accurate up to ~10 reps.
 */
function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/**
 * Brzycki formula: 1RM = weight * 36 / (37 - reps)
 * Diverges from Epley at higher rep counts; undefined at reps >= 37.
 */
function brzycki(weight: number, reps: number): number {
  return weight * (36 / (37 - reps));
}

export interface EstimateOneRepMaxOptions {
  formula?: OneRepMaxFormula;
}

/**
 * Estimates a one-rep max from a single set's weight and reps.
 *
 * Returns the raw weight unchanged for a 1-rep set (both formulas agree
 * trivially at reps = 1), and 0 for a non-positive weight or rep count.
 */
export function estimateOneRepMax(
  weight: number,
  reps: number,
  options: EstimateOneRepMaxOptions = {},
): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;

  const formula = options.formula ?? "epley";
  const raw = formula === "brzycki" ? brzycki(weight, reps) : epley(weight, reps);
  return Math.round(raw * 100) / 100;
}
