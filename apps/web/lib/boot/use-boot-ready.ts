"use client";

import { useSyncExternalStore } from "react";
import { isBootRevealed, subscribeBootRevealed } from "./gate";

/**
 * True once the boot gate (lib/boot/gate.ts) has decided the app is fully
 * loaded and settled. Latches: it never goes back to false. Drives the boot
 * splash (components/loading-screen.tsx) and the app's fade-in
 * (components/app-reveal.tsx) off the same signal so they crossfade rather
 * than drifting out of sync.
 */
export function useBootReady(): boolean {
  return useSyncExternalStore(subscribeBootRevealed, isBootRevealed, () => false);
}
