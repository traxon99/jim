"use client";

import { useEffect } from "react";

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

interface NavigatorWithWakeLock {
  wakeLock: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
}

function hasWakeLock(nav: Navigator): nav is Navigator & NavigatorWithWakeLock {
  return "wakeLock" in nav;
}

/**
 * Holds the Screen Wake Lock for as long as `active` is true
 * (docs/ARCHITECTURE.md §6) — an active logging session must never let the
 * screen sleep mid-set or mid-rest. Safari releases the lock whenever the
 * tab is hidden, so it's re-acquired on every `visibilitychange` back to
 * visible rather than requested just once.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !hasWakeLock(navigator)) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    async function acquire() {
      try {
        const lock = await (navigator as Navigator & NavigatorWithWakeLock).wakeLock.request(
          "screen",
        );
        if (cancelled) {
          await lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // Denied (e.g. low battery mode) — logging still works, just without the lock.
      }
    }

    void acquire();

    function onVisibilityChange() {
      if (document.visibilityState === "visible" && !sentinel) {
        void acquire();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release();
    };
  }, [active]);
}
