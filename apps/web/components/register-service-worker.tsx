"use client";

import { useEffect } from "react";

/**
 * Production only — public/sw.js doesn't exist in dev (see
 * scripts/generate-sw.mjs), and a caching service worker actively fights
 * Fast Refresh if it did.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  }, []);

  return null;
}
