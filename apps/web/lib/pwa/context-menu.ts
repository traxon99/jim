/**
 * Long-press targets that keep the browser's own context menu inside the
 * installed app: links and media (share, save), text entry (paste, autofill,
 * dictation), and anything explicitly marked selectable. Everything else is
 * app chrome, where "Open in New Tab" only breaks the illusion.
 *
 * Matched with `closest()`, not `matches()` — a long press lands on whatever
 * span happens to be under the finger, not on the link wrapping it.
 */
export const CONTEXT_MENU_ALLOWED_SELECTOR = [
  "a[href]",
  "img",
  "video",
  "audio",
  "textarea:not([disabled])",
  'input[type="text"]:not([disabled])',
  'input[type="search"]:not([disabled])',
  'input[type="email"]:not([disabled])',
  'input[type="password"]:not([disabled])',
  'input[type="number"]:not([disabled])',
  '[contenteditable="true"]',
  ".allow-pwa-select",
].join(", ");

export type ContextMenuContext = {
  /** Running from the home screen. In a browser tab we never interfere. */
  standalone: boolean;
  /** Shift is the desktop escape hatch back to the real menu. */
  shiftKey: boolean;
  /** The press landed on (or inside) CONTEXT_MENU_ALLOWED_SELECTOR. */
  onAllowedTarget: boolean;
  /** Text is selected, so the menu is the only way to copy it. */
  hasSelection: boolean;
};

export function shouldSuppressContextMenu({
  standalone,
  shiftKey,
  onAllowedTarget,
  hasSelection,
}: ContextMenuContext): boolean {
  if (!standalone) return false;
  if (shiftKey) return false;
  if (onAllowedTarget) return false;
  if (hasSelection) return false;
  return true;
}
