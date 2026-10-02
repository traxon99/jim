"use client";

import { startBootGate } from "@/lib/boot/gate";
import { useBootReady } from "@/lib/boot/use-boot-ready";
import { ICON_BACKGROUND, ICON_FOREGROUND } from "@/lib/pwa/icon-mark";
import { type CSSProperties, useEffect, useState } from "react";

/** How long the cold-open intro plays before the splash may lift, from page start. */
const COLD_INTRO_MS = 1400;
/** Matches the exit animations in globals.css (.loading-screen[data-loaded]). */
const COLD_EXIT_MS = 900;
const WARM_EXIT_MS = 200;

/**
 * Light streaks behind the mark: offset from center (vmin), width (vmin),
 * stagger delay (ms), and whether it takes the accent tint or stays white.
 * They glimmer in during the intro, then fan out as the mark zooms through.
 */
const STREAKS: { x: number; w: number; d: number; tint: boolean }[] = [
  { x: -15, w: 1.2, d: 120, tint: true },
  { x: -11, w: 2.4, d: 40, tint: false },
  { x: -8, w: 0.8, d: 200, tint: true },
  { x: -5, w: 1.6, d: 0, tint: false },
  { x: -2, w: 3, d: 160, tint: true },
  { x: 1, w: 1, d: 80, tint: false },
  { x: 3.5, w: 2.2, d: 240, tint: true },
  { x: 6, w: 0.8, d: 20, tint: false },
  { x: 9, w: 1.8, d: 180, tint: true },
  { x: 12.5, w: 1.2, d: 100, tint: false },
  { x: 16, w: 2, d: 260, tint: true },
];

/**
 * The boot splash. Server-rendered, so it's on screen for the very first
 * paint and picks up exactly where iOS's static launch image leaves off (the
 * same centered "J" at the same size, lib/pwa/splash-mark.tsx).
 *
 * On a cold open (first load of a session, lib/boot/cold-open.ts) it plays a
 * Netflix-style intro: a light sweep across the mark while streaks glimmer in
 * behind it, then, once everything has loaded, the mark zooms through the
 * screen and the streaks fan out as the app fades in. Warm reloads skip the
 * show and just breathe, then fade.
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
    <div
      className="loading-screen"
      style={{ "--splash-bg": ICON_BACKGROUND } as CSSProperties}
      data-loaded={ready}
      aria-hidden="true"
    >
      <div className="loading-screen-streaks">
        {STREAKS.map((streak) => (
          <span
            key={streak.x}
            className="loading-screen-streak"
            data-tint={streak.tint}
            style={
              {
                "--x": `${streak.x}vmin`,
                "--w": `${streak.w}vmin`,
                "--d": `${streak.d}ms`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <span className="loading-screen-mark" style={{ color: ICON_FOREGROUND }}>
        J
      </span>
    </div>
  );
}
