/** Room kept between the popover and the screen edges or its badge. */
const EDGE = 12;
const GAP = 8;
/** The status bar and page header sit above this, so don't open up into them. */
const TOP_CLEARANCE = 64;
const MAX_WIDTH = 380;

export interface PrpPopoverPlacement {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  /** Which side of the badge it opens on; the tail and transform-origin follow. */
  below: boolean;
  /** The tail's centre, from the popover's left edge, over the badge. */
  tailX: number;
}

/**
 * Where the PRP popover (#790) goes for its badge: below it when the content
 * fits there or there's more room below than above, else above it. It never
 * covers the badge: a list too tall for either side scrolls inside the room
 * it gets.
 */
export function prpPopoverPlacement(
  badge: { top: number; bottom: number; left: number },
  contentHeight: number,
  screen: { width: number; height: number },
): PrpPopoverPlacement {
  const width = Math.min(MAX_WIDTH, screen.width - EDGE * 2);
  const left = Math.min(Math.max(badge.left - EDGE, EDGE), screen.width - width - EDGE);
  const roomBelow = screen.height - EDGE - (badge.bottom + GAP);
  const roomAbove = badge.top - GAP - TOP_CLEARANCE;
  const below = contentHeight <= roomBelow || roomBelow >= roomAbove;
  const maxHeight = Math.max(0, below ? roomBelow : roomAbove);
  const height = Math.min(contentHeight, maxHeight);
  const top = below ? badge.bottom + GAP : badge.top - GAP - height;
  const tailX = Math.min(width - 28, Math.max(20, badge.left + 22 - left));
  return { top, left, width, maxHeight, below, tailX };
}
