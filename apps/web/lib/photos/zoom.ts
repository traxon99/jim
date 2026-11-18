/**
 * Pinch-zoom math for the full-screen viewer (issue #835), kept pure so the
 * gesture rules are testable and the component only wires pointer events.
 */

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
/** A double tap zooms to this, or back to fit. */
export const DOUBLE_TAP_SCALE = 2.5;

export interface Transform {
  scale: number;
  x: number;
  y: number;
}

export const FIT: Transform = { scale: 1, x: 0, y: 0 };

export const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

export interface Size {
  width: number;
  height: number;
}

/**
 * Keeps a zoomed image covering its frame: at scale s the picture is s times
 * as wide as the frame, so it can move by at most half the extra on a side.
 * At fit it can't move at all.
 */
export function clampTransform(transform: Transform, frame: Size, image: Size): Transform {
  const scale = clampScale(transform.scale);
  const maxX = Math.max(0, (image.width * scale - frame.width) / 2);
  const maxY = Math.max(0, (image.height * scale - frame.height) / 2);
  return {
    scale,
    // `|| 0` turns a clamped -0 into 0.
    x: Math.min(maxX, Math.max(-maxX, transform.x)) || 0,
    y: Math.min(maxY, Math.max(-maxY, transform.y)) || 0,
  };
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The transform after a pinch from `startFingers` to `fingers`, anchored so
 * the point between the fingers stays under them. Positions are relative to
 * the frame's centre.
 */
export function pinch(
  start: Transform,
  startFingers: readonly [Point, Point],
  fingers: readonly [Point, Point],
): Transform {
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const startDistance = distance(...startFingers) || 1;
  const scale = clampScale(start.scale * (distance(...fingers) / startDistance));
  const ratio = scale / start.scale;
  const mid = (pair: readonly [Point, Point]) => ({
    x: (pair[0].x + pair[1].x) / 2,
    y: (pair[0].y + pair[1].y) / 2,
  });
  const from = mid(startFingers);
  const to = mid(fingers);
  return {
    scale,
    x: to.x - (from.x - start.x) * ratio,
    y: to.y - (from.y - start.y) * ratio,
  };
}

/** The transform for a double tap at `point` (relative to the frame's centre). */
export function doubleTap(current: Transform, point: Point): Transform {
  if (current.scale > 1.05) return FIT;
  return {
    scale: DOUBLE_TAP_SCALE,
    x: -point.x * (DOUBLE_TAP_SCALE - 1),
    y: -point.y * (DOUBLE_TAP_SCALE - 1),
  };
}
