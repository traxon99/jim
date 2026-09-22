"use client";

import { ICON_BACKGROUND, ICON_FOREGROUND } from "@/lib/pwa/icon-mark";
import { useEffect, useState } from "react";

/**
 * Covers the app until the window "load" event fires — every resource on
 * the page (fonts, images, scripts), not just the initial HTML — so nothing
 * underneath is ever visible mid-load. Server-rendered, so it's already on
 * screen for the very first paint rather than popping in after hydration.
 */
export function LoadingScreen() {
  const [loaded, setLoaded] = useState(false);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (document.readyState === "complete") {
      setLoaded(true);
      return;
    }
    const onLoad = () => setLoaded(true);
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timeout = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(timeout);
  }, [loaded]);

  if (!mounted) return null;

  return (
    <div
      className="loading-screen"
      style={{ background: ICON_BACKGROUND }}
      data-loaded={loaded}
      aria-hidden="true"
    >
      <span className="loading-screen-mark" style={{ color: ICON_FOREGROUND }}>
        J
      </span>
    </div>
  );
}
