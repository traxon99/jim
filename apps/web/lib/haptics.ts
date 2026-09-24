/**
 * Best-effort haptic tap for logging a set (issue #121). `navigator.vibrate`
 * is unsupported on iOS (docs/ARCHITECTURE.md §2 constraint 3) — the iPhone
 * 16 this app targets gets nothing from this call, and the existing tap
 * ripple (components/ripple-effect.tsx) is the real feedback there. This
 * still fires on browsers that do support it, and never throws.
 */
export function triggerHaptic(pattern: number | number[] = 12): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Best-effort only.
  }
}
