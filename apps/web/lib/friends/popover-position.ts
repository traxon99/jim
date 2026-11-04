/** Room kept between a floating popover and the screen edges or its button. */
const EDGE = 12;
const GAP = 8;
/** Below this the status bar and page header sit, so don't open up into them. */
const TOP_CLEARANCE = 64;

/**
 * Where a small `fixed` popover goes for the button it belongs to (the
 * reaction picker, issue #748): above it, starting a little left of it, kept
 * inside the screen; below it when there's no room above.
 */
export function popoverPosition(
  button: { top: number; bottom: number; left: number },
  own: { width: number; height: number },
  screen: { width: number; height: number },
): { top: number; left: number } {
  const maxLeft = Math.max(EDGE, screen.width - own.width - EDGE);
  const left = Math.min(Math.max(button.left - EDGE, EDGE), maxLeft);
  const above = button.top - own.height - GAP;
  const top =
    above >= TOP_CLEARANCE
      ? above
      : Math.min(button.bottom + GAP, screen.height - own.height - EDGE);
  return { top, left };
}
