"use client";

import {
  isNotificationSupported,
  readPushNotificationsEnabled,
  writePushNotificationsEnabled,
} from "@/lib/pwa/notifications";
import { useEffect, useState } from "react";

type Status = "checking" | "unsupported" | "ready";

export function PushNotificationsSection() {
  const [status, setStatus] = useState<Status>("checking");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isNotificationSupported()) {
      setStatus("unsupported");
      return;
    }
    setPermission(Notification.permission);
    // A denied/reset browser permission always wins over a stale "on" preference.
    setEnabled(readPushNotificationsEnabled() && Notification.permission === "granted");
    setStatus("ready");
  }, []);

  async function handleToggle(next: boolean) {
    if (!next) {
      setEnabled(false);
      writePushNotificationsEnabled(false);
      return;
    }

    const result = permission === "granted" ? "granted" : await Notification.requestPermission();
    setPermission(result);
    const granted = result === "granted";
    setEnabled(granted);
    writePushNotificationsEnabled(granted);
  }

  if (status === "checking") return null;

  return (
    <div className="flex w-full max-w-xs flex-col gap-3 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Notifications
      </h2>

      {status === "unsupported" ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          This browser doesn't support notifications.
        </p>
      ) : (
        <>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
            <span className="flex flex-col">
              <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                App update alerts
              </span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                Get notified when a new version of Jim is ready
              </span>
            </span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => void handleToggle(event.target.checked)}
              className="h-5 w-5 shrink-0 accent-accent"
            />
          </label>

          {permission === "denied" && (
            <p className="text-xs text-red-600 dark:text-red-500">
              Notifications are blocked for Jim in your browser settings — enable them there to turn
              this on.
            </p>
          )}
        </>
      )}
    </div>
  );
}
