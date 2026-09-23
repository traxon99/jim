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
