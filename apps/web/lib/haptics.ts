/** Local preference, not an account setting — vibration support is per-browser anyway. */
export const HAPTICS_STORAGE_KEY = "jim:haptics-enabled";

export function readHapticsEnabled(): boolean {
  try {
    return window.localStorage.getItem(HAPTICS_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeHapticsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(HAPTICS_STORAGE_KEY, String(enabled));
  } catch {
    // Safari private mode etc. — the toggle still reflects for this page life.
  }
}

let cachedHapticSwitch: HTMLInputElement | null = null;

/**
 * A hidden native `<input type="checkbox" switch>` — iOS 18+ Safari gives a
 * real haptic tick when one of these is toggled, which is the only way to
 * get a haptic out of script on iOS now that `navigator.vibrate` is
 * unsupported there (docs/ARCHITECTURE.md §2 constraint 3). It carries no
 * meaning of its own, so it's visually and AX hidden; `sr-only` (not
 * `display:none`/off-screen positioning) keeps it genuinely rendered, which
 * this trick relies on.
 */
function getHapticSwitch(): HTMLInputElement | null {
  if (typeof document === "undefined") return null;
  if (cachedHapticSwitch?.isConnected) return cachedHapticSwitch;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = -1;
  input.className = "sr-only";
  document.body.appendChild(input);
  cachedHapticSwitch = input;
  return input;
}

/**
 * Best-effort haptic tap for logging a set (issue #121) and other primary
 * workout/nav actions (issue #136). Tries `navigator.vibrate` for browsers
 * that support it, and the hidden-switch trick above for iOS 18+ Safari —
 * between the two, the iPhone 16 this app targets now gets real haptic
 * feedback. Must be called synchronously from within a real user gesture
 * (a click/tap handler) for the switch trick to fire. Respects the user's
 * haptics setting and never throws.
 */
export function triggerHaptic(pattern: number | number[] = 12): void {
  if (!readHapticsEnabled()) return;
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Best-effort only.
  }
  try {
    getHapticSwitch()?.click();
  } catch {
    // Best-effort only.
  }
}
