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
