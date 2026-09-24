/** Local preference, not an account setting — Notification permission is per-browser anyway. */
export const PUSH_NOTIFICATIONS_STORAGE_KEY = "jim:push-notifications-enabled";

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function readPushNotificationsEnabled(): boolean {
  try {
    return window.localStorage.getItem(PUSH_NOTIFICATIONS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writePushNotificationsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(PUSH_NOTIFICATIONS_STORAGE_KEY, String(enabled));
  } catch {
    // Safari private mode etc. — the toggle still reflects for this page life.
  }
}

/**
 * What the current deployed version's "app updated" notification says
 * changed. Update this string alongside whatever shipped — it's the only
 * place the notification's content lives.
 */
export const LATEST_RELEASE_NOTE =
  "Tap a set's number to quickly mark it warmup, working, or failure — drop sets are gone, and the exercise card is tidier without a separate kind column.";

/** Builds the body text for the "app updated" notification. */
export function updateNotificationBody(releaseNote: string = LATEST_RELEASE_NOTE): string {
  return releaseNote ? `What's new: ${releaseNote}` : "A new version is ready — reload to update.";
}

/**
 * Whether a freshly-installed service worker should raise an "app updated"
 * notification. `hadController` is false on the very first install (there's
 * no prior version to update *from* — see register-service-worker.tsx), so
 * only a second-or-later install ever counts as an update.
 */
export function shouldNotifyOfUpdate({
  enabled,
  permission,
  hadController,
}: {
  enabled: boolean;
  permission: NotificationPermission;
  hadController: boolean;
}): boolean {
  return enabled && permission === "granted" && hadController;
}
