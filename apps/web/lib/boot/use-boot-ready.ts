"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isBootReady, subscribeBootReady } from "./ready";

/**
 * True once the window "load" event has fired (every resource on the page
 * loaded, not just the initial HTML/JS) *and* every registered boot task
 * (see registerBootTask) has settled. Drives the boot splash
 * (components/loading-screen.tsx) and the app's fade-in
 * (components/app-reveal.tsx) off the same signal so they crossfade rather
 * than drifting out of sync.
 */
export function useBootReady(): boolean {
  const [windowLoaded, setWindowLoaded] = useState(false);
  const tasksReady = useSyncExternalStore(subscribeBootReady, isBootReady, isBootReady);

  useEffect(() => {
    if (document.readyState === "complete") {
      setWindowLoaded(true);
      return;
    }
    const onLoad = () => setWindowLoaded(true);
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return windowLoaded && tasksReady;
}
