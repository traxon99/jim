"use client";

import { syncPushSubscription } from "@/lib/pwa/push-client";
import { reloadOnUpdateWhenAway } from "@/lib/pwa/update-reload";
import { useEffect } from "react";

/**
 * Production only. public/sw.js doesn't exist in dev (see
 * scripts/generate-sw.mjs), and a caching service worker would fight Fast
 * Refresh if it did.
 *
 * The "Jim updated" notification is no longer raised from here. It arrives
 * as a Web Push message that the service worker shows itself
 * (public/sw.template.js), so it reaches the user even when Jim is closed.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Captured before register() resolves. A controller already present
    // means this is a repeat visit, so a later controllerchange is a genuine
    // update rather than the app's very first install.
    const hadController = navigator.serviceWorker.controller !== null;

    // A freshly-activated service worker claims this page (self.clients.claim()
    // in sw.template.js) without the already-running React app ever re-executing
    // — the tab just keeps running whatever JS it loaded with until something
    // reloads it. On an installed iOS PWA that gets suspended rather than fully
    // killed when backgrounded, "restarting" the app can resume that same
    // in-memory session indefinitely, so an update can otherwise never actually
    // take effect for the user. Force the one reload a genuine update needs,
    // once the user isn't looking (#507); gated on hadController so a
    // brand-new install doesn't reload itself.
    const stopReloadOnUpdate = hadController
      ? reloadOnUpdateWhenAway(navigator.serviceWorker, document, () => window.location.reload())
      : undefined;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => syncPushSubscription(registration))
      .catch((error) => {
        console.error("Service worker registration or push sync failed:", error);
      });

    return stopReloadOnUpdate;
  }, []);

  return null;
}
