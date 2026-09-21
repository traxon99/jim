/**
 * Plate breakdown for a barbell lift (docs/ARCHITECTURE.md §4, "Shared
 * computation") — shared so the number shown on the phone during an active
 * session can't drift from anything computed elsewhere.
 *
 * Assumes an unlimited number of each owned plate size (a home/commercial
 * gym has pairs of everything on the list), so the greedy largest-first
 * fill is always optimal: it never leaves weight on the table that a
 * smaller combination could have hit, and it minimises plates per side.
 */
export interface PlateBreakdown {
  /** Plate sizes loaded per side, largest first (e.g. [45, 25, 10]). */
  perSide: number[];
  /** Weight per side that no combination of the available plates can make up. */
  remainderPerSide: number;
}

const EPSILON = 1e-6;

/**
 * `targetWeight` is the total weight on the bar, `barWeight` the empty bar.
 * A target at or below the bar's own weight loads nothing.
 */
export function calculatePlateBreakdown(
  targetWeight: number,
  barWeight: number,
  availablePlates: readonly number[],
): PlateBreakdown {
  let perSideRemaining = (targetWeight - barWeight) / 2;
  if (!Number.isFinite(perSideRemaining) || perSideRemaining <= EPSILON) {
    return { perSide: [], remainderPerSide: Math.max(perSideRemaining, 0) };
  }

  const descending = [...availablePlates].filter((p) => p > 0).sort((a, b) => b - a);
  const perSide: number[] = [];

  for (const plate of descending) {
    while (perSideRemaining + EPSILON >= plate) {
      perSide.push(plate);
      perSideRemaining -= plate;
    }
  }

  return {
    perSide,
    remainderPerSide: perSideRemaining < EPSILON ? 0 : Math.round(perSideRemaining * 100) / 100,
  };
}
