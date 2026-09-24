import {
  PUSH_NOTIFICATIONS_STORAGE_KEY,
  type PushSupport,
  VAPID_PUBLIC_KEY,
  detectPushSupport,
  urlBase64ToUint8Array,
} from "@/lib/pwa/notifications";

// Browser-only helpers for the Web Push subscription lifecycle. The server
// side lives in app/api/push/subscription/route.ts (storage) and
// scripts/send-release-push.ts (sending).

export function currentPushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  return detectPushSupport({
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone:
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  });
}

async function saveOnServer(subscription: PushSubscription): Promise<void> {
  const response = await fetch("/api/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error(`Saving the push subscription failed (${response.status})`);
}

async function forgetOnServer(endpoint: string): Promise<void> {
  const response = await fetch("/api/push/subscription", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) throw new Error(`Removing the push subscription failed (${response.status})`);
}

/** Subscribes this browser (the caller has already obtained permission) and registers it with the server. */
export async function subscribeToPush(registration: ServiceWorkerRegistration): Promise<void> {
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Required by Chrome and Safari: every push must show a notification.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));
  await saveOnServer(subscription);
}

export async function unsubscribeFromPush(registration: ServiceWorkerRegistration): Promise<void> {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await forgetOnServer(endpoint);
}

/**
 * Runs on every app load. Re-posts an existing subscription so the server's
 * copy can't silently go stale (a push service can rotate it, or the user
 * may now be signed in to a different account), and carries a pre-Web-Push
 * opt-in (the old localStorage flag) over to a real subscription so nobody
 * who'd turned alerts on has to do it again.
 */
export async function syncPushSubscription(registration: ServiceWorkerRegistration): Promise<void> {
  if (currentPushSupport() !== "supported" || !VAPID_PUBLIC_KEY) return;
  if (Notification.permission !== "granted") return;

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await saveOnServer(existing);
    return;
  }

  let legacyOptIn = false;
  try {
    legacyOptIn = window.localStorage.getItem(PUSH_NOTIFICATIONS_STORAGE_KEY) === "true";
  } catch {
    // Storage unavailable: nothing to migrate.
  }
  if (!legacyOptIn) return;
  await subscribeToPush(registration);
  try {
    window.localStorage.removeItem(PUSH_NOTIFICATIONS_STORAGE_KEY);
  } catch {
    // Harmless: next load just finds the subscription and takes the branch above.
  }
}
