/**
 * Shared pointer math for the tappable charts (issue #468): which data point
 * a hover or tap is nearest to, and which way its tooltip should open so it
 * never runs past the chart's edge (docs/PWA.md §3).
 */

/**
 * Index of the x position closest to `x`, or null when there are none.
 * Ties go to the later point, which is drawn on top.
 */
export function nearestIndexByX(xs: readonly number[], x: number): number | null {
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, candidate] of xs.entries()) {
    const distance = Math.abs(candidate - x);
    if (distance <= bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Converts a pointer event's client x into the SVG's viewBox units, given
 * the SVG's on-screen box and its viewBox width.
 */
export function clientXToViewBox(
  clientX: number,
  box: { left: number; width: number },
  viewBoxWidth: number,
): number {
  if (box.width <= 0) return 0;
  return ((clientX - box.left) / box.width) * viewBoxWidth;
}

export type TooltipAlign = "left" | "center" | "right";

/**
 * Near the left edge the tooltip grows rightward from the point, near the
 * right edge leftward, otherwise centered on it.
 */
export function tooltipAlign(xFraction: number): TooltipAlign {
  if (xFraction < 0.3) return "left";
  if (xFraction > 0.7) return "right";
  return "center";
}

/** "225 lb × 5" (or "225 × 5" with no units), weight rounded to 2 places. */
export function formatSetLine(weight: number, reps: number, units?: string): string {
  const rounded = Math.round(weight * 100) / 100;
  return `${rounded.toLocaleString()}${units ? ` ${units}` : ""} × ${reps}`;
}
