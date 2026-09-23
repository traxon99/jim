"use client";

import {
  readPushNotificationsEnabled,
  shouldNotifyOfUpdate,
  updateNotificationBody,
} from "@/lib/pwa/notifications";
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

    // Captured before register() resolves — a controller already present
    // means this is a *repeat* visit, so an install found from here on is a
    // genuine update rather than the app's very first install.
    const hadController = navigator.serviceWorker.controller !== null;

    // A freshly-activated service worker claims this page (self.clients.claim()
    // in sw.template.js) without the already-running React app ever re-executing
    // — the tab just keeps running whatever JS it loaded with until something
    // reloads it. On an installed iOS PWA that gets suspended rather than fully
    // killed when backgrounded, "restarting" the app can resume that same
    // in-memory session indefinitely, so an update can otherwise never actually
    // take effect for the user. Force the one reload a genuine update needs;
    // gated on hadController so a brand-new install doesn't reload itself.
    if (hadController) {
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state !== "installed") return;
            const permission: NotificationPermission =
              "Notification" in window ? Notification.permission : "denied";
            if (
              !shouldNotifyOfUpdate({
                enabled: readPushNotificationsEnabled(),
                permission,
                hadController,
              })
            ) {
              return;
            }
            void registration.showNotification("Jim updated", {
              body: updateNotificationBody(),
              icon: "/icons/192",
            });
          });
        });
      })
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });
  }, []);

  return null;
}
