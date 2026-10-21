"use client";

import { SWITCH_CLASS } from "@/components/switch-class";
import { type SettingsRow, db } from "@/lib/db/schema";
import { VAPID_PUBLIC_KEY } from "@/lib/pwa/notifications";
import { type InstallPlatform, detectInstallPlatform } from "@/lib/pwa/platform";
import { currentPushSupport, subscribeToPush, unsubscribeFromPush } from "@/lib/pwa/push-client";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";

type PushKindKey =
  | "pushRestTimer"
  | "pushWorkoutReminders"
  | "pushWhatsNew"
  | "pushWhatsNewEveryDeploy";

/** One switch per kind of push (issue #668), saved to the account like any setting. */
const PUSH_KINDS: {
  key: Exclude<PushKindKey, "pushWhatsNewEveryDeploy">;
  label: string;
  detail: string;
}[] = [
  { key: "pushRestTimer", label: "Rest timer", detail: "When a rest ends and Jim is closed" },
  {
    key: "pushWorkoutReminders",
    label: "Workout reminders",
    detail: "When a workout's been left open, and when Jim ends it for you",
  },
  { key: "pushWhatsNew", label: "What's new", detail: "After Jim updates" },
];

type Status =
  | "checking"
  | "unsupported"
  | "unavailable"
  | "needs-install"
  | "not-configured"
  | "ready";

/**
 * The service worker is registered only in production builds
 * (register-service-worker.tsx), so dev has nothing to subscribe with.
 */
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (process.env.NODE_ENV !== "production") return null;
  // Not `ready`: it never settles when the worker failed to install, which
  // left this whole section blank (#685).
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** Where to turn notifications back on, in the phone's own words (#685). */
function blockedHelp(platform: InstallPlatform): string {
  if (platform === "ios") {
    return "Notifications are off for Jim. Turn them on in Settings → Notifications → Jim, then come back here.";
  }
  if (platform === "android") {
    return "Notifications are blocked for Jim. Allow them in Settings → Apps → Jim → Notifications, then come back here.";
  }
  return "Notifications are blocked for Jim in this browser's site settings. Allow them there to turn this on.";
}

export function PushNotificationsSection() {
  const [status, setStatus] = useState<Status>("checking");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cached = useLiveQuery(() => db.settings.get("me"), []);
  const settings = cached ?? DEFAULT_SETTINGS;

  async function saveKind(patch: Partial<Pick<SettingsRow, PushKindKey>>) {
    setError(null);
    const result = await patchSettings(patch);
    if (!result.ok) setError(result.error);
  }

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
        setStatus("unavailable");
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

      {status === "unavailable" && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Notifications aren't available right now. Close Jim fully and open it again to retry.
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
              <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                Notifications on this phone
              </span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                Jim can reach you even when it's closed
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

          {enabled && (
            <div className="flex flex-col gap-1 border-l border-zinc-200 pl-3 dark:border-zinc-800">
              {PUSH_KINDS.map((kind) => {
                const checked = settings[kind.key] !== false;
                const switchRow = (
                  <label
                    key={kind.key}
                    className="flex min-h-11 items-center justify-between gap-3 text-xs font-medium"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      {kind.label}
                      <span className="font-normal text-zinc-500 dark:text-zinc-500">
                        {kind.detail}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-checked={checked}
                      checked={checked}
                      onChange={(event) => void saveKind({ [kind.key]: event.target.checked })}
                      className={SWITCH_CLASS}
                    />
                  </label>
                );
                if (kind.key !== "pushWhatsNew" || !checked) return switchRow;
                // Opt back in to a push per deploy (issue #702), as before #668.
                const everyDeploy = settings.pushWhatsNewEveryDeploy === true;
                return (
                  <div key={kind.key} className="flex flex-col gap-1">
                    {switchRow}
                    <label className="ml-3 flex min-h-11 items-center justify-between gap-3 border-l border-zinc-200 pl-3 text-xs font-medium dark:border-zinc-800">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        Every new feature
                        <span className="font-normal text-zinc-500 dark:text-zinc-500">
                          As soon as it's deployed, instead of once a day
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        aria-checked={everyDeploy}
                        checked={everyDeploy}
                        onChange={(event) =>
                          void saveKind({ pushWhatsNewEveryDeploy: event.target.checked })
                        }
                        className={SWITCH_CLASS}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          {permission === "denied" && (
            <p className="text-xs text-red-600 dark:text-red-500">
              {blockedHelp(
                detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0),
              )}
            </p>
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-500">{error}</p>}
        </>
      )}
    </div>
  );
}
