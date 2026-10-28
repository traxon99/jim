/**
 * Elements that raise the on-screen keyboard when focused. Buttons, checkboxes
 * and the like are `<input>`s too but never bring the keyboard up.
 */
export const KEYBOARD_TARGET_SELECTOR = [
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]):not([type="hidden"])',
  "textarea",
  "select",
  '[contenteditable="true"]',
].join(", ");

export type DocumentScrollContext = {
  /** Running from the home screen. In a browser tab we never interfere. */
  standalone: boolean;
  /** window.scrollX / window.scrollY at the time of the check. */
  scrollX: number;
  scrollY: number;
  /** Something that owns the keyboard is focused, so the keyboard is (or is about to be) up. */
  keyboardTargetFocused: boolean;
};

/**
 * In the installed app the document never scrolls (app/globals.css, issue
 * #194) — but iOS scrolls it anyway to lift a focused input above the
 * keyboard, and doesn't reliably scroll it back once the keyboard closes. That
 * leaves the whole layout, bottom bars included, stuck partway up the screen
 * (issue #205). Once nothing holds the keyboard, any leftover document scroll
 * is that stale offset and should be put back to zero.
 */
export function shouldResetDocumentScroll({
  standalone,
  scrollX,
  scrollY,
  keyboardTargetFocused,
}: DocumentScrollContext): boolean {
  if (!standalone || keyboardTargetFocused) return false;
  return scrollX !== 0 || scrollY !== 0;
}

/**
 * Whether the floating tab bar should get out of the way. iOS lifts the whole
 * document to keep the caret in view, so a bottom-pinned bar ends up floating
 * over the content just above the keyboard (#729). Native iOS apps leave the
 * tab bar behind the keyboard; hiding it while an input holds the keyboard
 * matches that. In a browser tab there's no lift to undo, so it stays.
 */
export function shouldHideTabBar({
  standalone,
  keyboardTargetFocused,
}: Pick<DocumentScrollContext, "standalone" | "keyboardTargetFocused">): boolean {
  return standalone && keyboardTargetFocused;
}
