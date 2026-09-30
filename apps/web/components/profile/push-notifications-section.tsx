"use client";

import { SWITCH_CLASS } from "@/components/switch-class";
import { VAPID_PUBLIC_KEY } from "@/lib/pwa/notifications";
import { currentPushSupport, subscribeToPush, unsubscribeFromPush } from "@/lib/pwa/push-client";
import { useEffect, useState } from "react";

type Status = "checking" | "unsupported" | "needs-install" | "not-configured" | "ready";

/**
 * The service worker is registered only in production builds
 * (register-service-worker.tsx), so dev has nothing to subscribe with.
 */
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (process.env.NODE_ENV !== "production") return null;
  return navigator.serviceWorker.ready;
}

export function PushNotificationsSection() {
  const [status, setStatus] = useState<Status>("checking");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const support = currentPushSupport();
      if (support !== "supported") {
        setStatus(support);
        return;
      }
      if (!VAPID_PUBLIC_KEY) {
        setStatus("not-configured");
        return;
      }
      const registration = await getRegistration();
      if (cancelled) return;
      if (!registration) {
        setStatus("unsupported");
        return;
      }
      const subscription = await registration.pushManager.getSubscription();
      if (cancelled) return;
      setPermission(Notification.permission);
      // A denied or reset browser permission always wins over a leftover subscription.
      setEnabled(subscription !== null && Notification.permission === "granted");
      setStatus("ready");
    }
    check().catch(() => {
      if (!cancelled) setStatus("unsupported");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(next: boolean) {
    setError(null);
    setBusy(true);
    try {
      if (!next) {
        const registration = await getRegistration();
        if (registration) await unsubscribeFromPush(registration);
        setEnabled(false);
        return;
      }

      // Asked before anything else is awaited: Safari only shows the prompt
      // while still handling the tap (a user gesture).
      const result = permission === "granted" ? "granted" : await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;
      const registration = await getRegistration();
      if (!registration) return;
      await subscribeToPush(registration);
      setEnabled(true);
    } catch (cause) {
      console.error("Updating push notifications failed:", cause);
      setError("Couldn't update notifications. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking") return null;

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Notifications
      </h2>

      {status === "unsupported" && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          This browser doesn't support push notifications.
        </p>
      )}

      {status === "needs-install" && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          To get notifications on iPhone or iPad, add Jim to your Home Screen (Share → Add to Home
          Screen), then open it from there and turn them on here.
        </p>
      )}

      {status === "not-configured" && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Push notifications aren't set up for this version of Jim yet.
        </p>
      )}

      {status === "ready" && (
        <>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
            <span className="flex flex-col">
              <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Alerts</span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                Get notified when your rest timer finishes or a new version of Jim is ready, even
                when the app isn't the active tab
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={enabled}
              checked={enabled}
              disabled={busy}
              onChange={(event) => void handleToggle(event.target.checked)}
              className={SWITCH_CLASS}
            />
          </label>

          {permission === "denied" && (
            <p className="text-xs text-red-600 dark:text-red-500">
              Notifications are blocked for Jim in your browser settings. Allow them there to turn
              this on.
            </p>
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-500">{error}</p>}
        </>
      )}
    </div>
  );
}
