/**
 * Keeps a scroller still while the keyboard opens and closes (#858).
 *
 * In the installed app iOS lifts the whole document to bring a focused input
 * above the keyboard, and on the way it also scrolls the scroller the input
 * lives in. When the keyboard closes, `PwaChrome` puts the document back at
 * 0,0, but nothing undoes the scroller's share, so the workout lands a
 * keyboard's height further down, often on another exercise. Each tap into a
 * set input moved it again.
 *
 * The fix pins the focused input to the spot on screen where the lifter
 * tapped it: its offset from the scroller's top is recorded on focus, and
 * whenever iOS moves the scroller, the scroller is scrolled back so that
 * offset holds. A drag by the lifter drops the pin, since then they moved the
 * page on purpose.
 */

/** The focused input's place in its scroller when it was focused. */
export type KeyboardAnchor = {
  element: Element;
  /** Input top minus scroller top, in px, when it was focused. */
  offset: number;
  /** The scroller's scrollTop then, for when the input unmounts (a set got logged). */
  scrollTop: number;
};

/**
 * The scroller's place in the visible screen: the part of it above the
 * keyboard. Rects are in layout-viewport px, so a document lift moves the
 * scroller and the input together and drops out of the offset.
 */
export type VisibleBand = { top: number; bottom: number };

/**
 * Whether a newly focused input gets a pin. Only one already on screen does:
 * an input reached by the keyboard's arrows from off screen has no spot to
 * keep, and iOS has to scroll to show it.
 */
export function anchorOffset(
  inputRect: { top: number; bottom: number },
  scrollerRect: { top: number; bottom: number },
): number | null {
  if (inputRect.top < scrollerRect.top || inputRect.bottom > scrollerRect.bottom) return null;
  return inputRect.top - scrollerRect.top;
}

/**
 * The scrollTop that puts the anchored input back where it was tapped, or
 * null when the scroller is already there. While the keyboard is up the pin
 * gives way if holding it would leave the input under the keyboard, since
 * then iOS's scroll is the one that keeps it visible.
 */
export function restoredScrollTop({
  anchor,
  scrollTop,
  inputRect,
  scrollerTop,
  visible,
}: {
  anchor: Pick<KeyboardAnchor, "offset" | "scrollTop">;
  scrollTop: number;
  /** The input's rect now, or null once it has unmounted. */
  inputRect: { top: number; bottom: number } | null;
  scrollerTop: number;
  /** The band above the keyboard while it's up; null once it has closed. */
  visible: VisibleBand | null;
}): number | null {
  if (!inputRect) {
    const target = Math.max(0, anchor.scrollTop);
    return Math.abs(target - scrollTop) < 1 ? null : target;
  }
  const drift = inputRect.top - scrollerTop - anchor.offset;
  if (Math.abs(drift) < 1) return null;
  if (visible) {
    const top = inputRect.top - drift;
    const bottom = inputRect.bottom - drift;
    if (top < visible.top || bottom > visible.bottom) return null;
  }
  return Math.max(0, scrollTop + drift);
}
