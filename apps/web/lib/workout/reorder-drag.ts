/**
 * The pure half of rearranging a workout's exercises (issue #658): how long
 * a press on an exercise name takes to pick it up, where a dragged row lands
 * and how fast the list scrolls while it's held near an edge. The pointer
 * wiring lives in `components/workout/use-long-press.ts` and
 * `components/workout/reorder-exercises-sheet.tsx`.
 */

/** How long a finger rests on an exercise name before it's picked up. */
export const LONG_PRESS_MS = 400;
/** Moving further than this before then is a scroll, not a press. */
export const LONG_PRESS_SLOP_PX = 10;
/** Each condensed row's height, so a drop slot is just a division. */
export const REORDER_ROW_PX = 56;
/** How close to the list's top or bottom edge a held row starts it scrolling. */
export const EDGE_SCROLL_ZONE_PX = 64;
/** The fastest it scrolls, per animation frame, with the row right at the edge. */
export const EDGE_SCROLL_MAX_PX = 14;

/** Whether a finger that has moved (dx, dy) since pressing is still a press. */
export function stillPressing(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) <= LONG_PRESS_SLOP_PX;
}

/**
 * The slot a row dragged to `top` (its top edge, in list coordinates) drops
 * into: whichever slot its middle is over, clamped to the list.
 */
export function dropIndex(top: number, count: number, rowHeight = REORDER_ROW_PX): number {
  if (count <= 0) return 0;
  const index = Math.floor((top + rowHeight / 2) / rowHeight);
  return Math.min(Math.max(index, 0), count - 1);
}

/** `ids` with `id` moved to `index`; unchanged if `id` isn't there. */
export function moveId(ids: readonly string[], id: string, index: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return [...ids];
  const rest = ids.filter((other) => other !== id);
  const to = Math.min(Math.max(index, 0), rest.length);
  return [...rest.slice(0, to), id, ...rest.slice(to)];
}

/**
 * How far to scroll the list this frame for a finger at `y` in a list
 * spanning `top`..`bottom` on screen: negative near the top, positive near
 * the bottom, faster the closer it gets, and 0 in between. A list that fits
 * never scrolls, because the browser clamps `scrollTop`.
 */
export function edgeScrollSpeed(y: number, top: number, bottom: number): number {
  const zone = Math.min(EDGE_SCROLL_ZONE_PX, (bottom - top) / 3);
  if (zone <= 0) return 0;
  const intoTop = top + zone - y;
  if (intoTop > 0) return -Math.round(EDGE_SCROLL_MAX_PX * Math.min(intoTop / zone, 1));
  const intoBottom = y - (bottom - zone);
  if (intoBottom > 0) return Math.round(EDGE_SCROLL_MAX_PX * Math.min(intoBottom / zone, 1));
  return 0;
}
