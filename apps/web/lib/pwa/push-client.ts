import {
  PUSH_NOTIFICATIONS_STORAGE_KEY,
  type PushMessage,
  type PushSupport,
  VAPID_PUBLIC_KEY,
  detectPushSupport,
  urlBase64ToUint8Array,
} from "@/lib/pwa/notifications";

// Browser-only helpers for the Web Push subscription lifecycle. The server
// side lives in app/api/push/subscription/route.ts (storage),
// scripts/send-release-push.ts (release pushes) and app/api/push/rest-timer
// (rest timer pushes).

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
 * Shows a notification straight from the page through the already-registered
 * service worker — no network round trip, no VAPID, not the `push` event —
 * the fallback for the rest timer's end when scheduleRestCompletePush
 * couldn't hand it to the server (see lib/sessions/use-rest-timer.ts). It
 * only fires once the page is running again, so on a backgrounded phone it's
 * late by however long Jim stayed in the background.
 * `showNotification` still surfaces as a system notification even when Jim
 * isn't the focused tab, unlike an in-page toast. Silently no-ops wherever
 * the release push also would: no service worker (dev — see
 * register-service-worker.tsx), or notification permission not already
 * granted. Never prompts — permission is only ever requested from the
 * Settings toggle.
 */
export async function showLocalNotification(message: PushMessage): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  if (!("serviceWorker" in navigator) || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(message.title, {
    body: message.body,
    icon: "/icons/192",
    badge: "/icons/192",
    tag: message.tag,
    data: { url: message.url },
  });
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

/**
 * Asks the server to push "Rest complete" to this device at `endsAt`
 * (docs/DECISIONS.md ADR-014), so it arrives on time even while iOS has
 * Jim's page suspended. Resolves true only when the push is actually
 * scheduled; on false the caller shows its own local notification instead.
 * Never prompts for permission.
 */
export async function scheduleRestCompletePush(endsAt: Date): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return false;
  if (currentPushSupport() !== "supported" || !VAPID_PUBLIC_KEY) return false;
  if (Notification.permission !== "granted") return false;

  // getRegistration, not `ready`: `ready` never settles without a worker.
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;

  const response = await fetch("/api/push/rest-timer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endsAt: endsAt.toISOString(), endpoint: subscription.endpoint }),
  });
  return response.ok;
}

/** Cancels a push scheduled by scheduleRestCompletePush (rest skipped, workout over). */
export async function cancelRestCompletePush(): Promise<void> {
  const response = await fetch("/api/push/rest-timer", { method: "DELETE", keepalive: true });
  if (!response.ok) throw new Error(`Cancelling the rest timer push failed (${response.status})`);
}
