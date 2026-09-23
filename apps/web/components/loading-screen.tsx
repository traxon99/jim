"use client";

import { useBootReady } from "@/lib/boot/use-boot-ready";
import { ICON_BACKGROUND, ICON_FOREGROUND } from "@/lib/pwa/icon-mark";
import { useEffect, useState } from "react";

/**
 * Covers the app until `useBootReady` reports everything's actually there —
 * the window "load" event plus any other registered boot tasks — then
 * crossfades into the app (components/app-reveal.tsx uses the same signal).
 * Server-rendered, so it's already on screen for the very first paint rather
 * than popping in after hydration.
 */
export function LoadingScreen() {
  const ready = useBootReady();
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (!ready) return;
    const timeout = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(timeout);
  }, [ready]);

  if (!mounted) return null;

  return (
    <div
      className="loading-screen"
      style={{ background: ICON_BACKGROUND }}
      data-loaded={ready}
      aria-hidden="true"
    >
      <span className="loading-screen-mark" style={{ color: ICON_FOREGROUND }}>
        J
      </span>
    </div>
  );
}
