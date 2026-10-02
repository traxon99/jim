"use client";

import { startBootGate } from "@/lib/boot/gate";
import { useBootReady } from "@/lib/boot/use-boot-ready";
import { useEffect, useState } from "react";

/** How long the cold-open intro plays before the splash may lift, from page start. */
const COLD_INTRO_MS = 1400;
/** Matches the exit transition in globals.css (.loading-screen[data-loaded]). */
const COLD_EXIT_MS = 400;
const WARM_EXIT_MS = 200;

/**
 * The boot splash. Server-rendered, so it's on screen for the very first
 * paint, on the same blank system-theme background as iOS's launch image
 * (lib/pwa/splash-mark.tsx), so the handoff is invisible.
 *
 * On a cold open (first load of a session, lib/boot/cold-open.ts) it draws
 * the wordmark: the "J" rises in, then "im" slides out from behind it while
 * the word eases to center, and it holds there until the app is ready. Warm
 * reloads just breathe the "J", then fade.
 *
 * Either way it doesn't lift until the boot gate (lib/boot/gate.ts) says the
 * app has fully loaded and settled; components/app-reveal.tsx uses the same
 * signal so the two crossfade.
 */
export function LoadingScreen() {
  const ready = useBootReady();
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const cold = document.documentElement.dataset.boot !== "warm";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    startBootGate({ minVisibleMs: cold && !reducedMotion ? COLD_INTRO_MS : 0 });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const cold = document.documentElement.dataset.boot !== "warm";
    // Unmount on a timer rather than animationend, which iOS can drop
    // (docs/LESSONS.md, #356); under reduced motion nothing animates anyway.
    const timeout = setTimeout(() => setMounted(false), cold ? COLD_EXIT_MS : WARM_EXIT_MS);
    return () => clearTimeout(timeout);
  }, [ready]);

  if (!mounted) return null;

  return (
    <div className="loading-screen" data-loaded={ready} aria-hidden="true">
      <span className="loading-screen-word">
        <span className="loading-screen-mark">J</span>
        {/* A grid track growing 0fr to 1fr widens this to fit "im" exactly,
            so the word recenters itself as it's drawn, in whatever font. */}
        <span className="loading-screen-tail">
          <span>
            <span>im</span>
          </span>
        </span>
      </span>
    </div>
  );
}
