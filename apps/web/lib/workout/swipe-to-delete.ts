/**
 * The pure half of swipe-left-to-delete on a set row (issue #350): deciding
 * whether a drag is a swipe or a scroll, how far the row follows the
 * finger, and whether letting go deletes it. The pointer wiring lives in
 * `components/workout/use-swipe-to-delete.ts`.
 */

/** How far a finger moves before the drag counts as a swipe or a scroll. */
const SWIPE_SLOP_PX = 10;
/** A release this far across the row (as a fraction of its width) deletes. */
const SWIPE_DELETE_FRACTION = 0.35;
/** …or this far, whichever is shorter, so wide rows don't need a long drag. */
export const SWIPE_DELETE_MAX_PX = 140;

export type SwipeIntent = "swipe" | "scroll" | "undecided";

/**
 * A drag that moves left more than it moves vertically is a swipe; one that
 * moves vertically (or right) first is left to the page as a scroll/tap.
 */
export function swipeIntent(dx: number, dy: number): SwipeIntent {
  if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) return "undecided";
  return dx < 0 && Math.abs(dx) > Math.abs(dy) ? "swipe" : "scroll";
}

/** The row's offset for a drag of `dx`: leftwards only, at most its width. */
export function swipeOffset(dx: number, width: number): number {
  return Math.max(Math.min(dx, 0), -Math.max(width, 0));
}

/** The leftward offset at which letting go deletes the row. */
export function swipeDeleteThreshold(width: number): number {
  return Math.min(width * SWIPE_DELETE_FRACTION, SWIPE_DELETE_MAX_PX);
}

/** Whether letting go at `offset` deletes the row rather than snapping back. */
export function swipeDeletes(offset: number, width: number): boolean {
  return width > 0 && -offset >= swipeDeleteThreshold(width);
}
