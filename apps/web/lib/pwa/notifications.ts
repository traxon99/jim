/**
 * Legacy per-browser "on" flag from before notifications moved to Web Push.
 * Only read now, to carry an existing opt-in over to a real push
 * subscription (see lib/pwa/push-client.ts), then cleared.
 */
export const PUSH_NOTIFICATIONS_STORAGE_KEY = "jim:push-notifications-enabled";

/**
 * The VAPID public key the browser's push service ties a subscription to.
 * Inlined at build time. When it's unset (local dev, or a deploy that hasn't
 * had its keys configured), push is simply unavailable, not broken.
 */
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/**
 * What the current deployed version's "app updated" notification says
 * changed. Update this string alongside whatever shipped. It's the only
 * place the notification's content lives, and every production deploy
 * pushes it to every subscribed device (scripts/send-release-push.ts).
 */
export const LATEST_RELEASE_NOTE =
  "Shared routine links now show a preview in Messages and other chats: name, time and exercises.";

/** Builds the body text for the "app updated" notification. */
export function updateNotificationBody(releaseNote: string = LATEST_RELEASE_NOTE): string {
  return releaseNote ? `What's new: ${releaseNote}` : "A new version is ready. Open Jim to update.";
}

/** The JSON a push message carries. public/sw.template.js's `push` handler reads it. */
export interface PushMessage {
  title: string;
  body: string;
  /** Same-origin path to open when the notification is tapped. */
  url: string;
  /** Replaces an earlier, still-showing notification with the same tag. */
  tag: string;
}

export function releasePushMessage(releaseNote: string = LATEST_RELEASE_NOTE): PushMessage {
  return {
    title: "Jim updated",
    body: updateNotificationBody(releaseNote),
    url: "/",
    tag: "jim-release",
  };
}

/**
 * Shown when the rest timer finishes. Normally sent as a real Web Push at the
 * rest's end instant, scheduled through QStash (app/api/push/rest-timer,
 * docs/DECISIONS.md ADR-014), because iOS suspends a backgrounded page's JS
 * and a page-side timer can't fire until the user returns. When that
 * couldn't be scheduled (no push subscription on this device, push not
 * configured, offline), lib/sessions/use-rest-timer.ts falls back to showing
 * it from the page via showLocalNotification.
 */
export function restCompleteMessage(): PushMessage {
  return {
    title: "Rest complete",
    body: "Time for your next set.",
    url: "/",
    tag: "jim-rest-timer",
  };
}

export type PushSupport =
  /** Service worker + Push API + Notifications API all present. */
  | "supported"
  /** iOS/iPadOS Safari tab: Web Push only exists once Jim is added to the Home Screen. */
  | "needs-install"
  | "unsupported";

/**
 * Pure so it's testable without a browser. iPadOS reports itself as
 * "Macintosh", so a touch-capable Mac UA counts as iOS too.
 */
export function detectPushSupport(env: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
}): PushSupport {
  if (env.hasServiceWorker && env.hasPushManager && env.hasNotification) return "supported";
  const isIos =
    /iPhone|iPad|iPod/.test(env.userAgent) ||
    (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1);
  if (isIos && !env.standalone) return "needs-install";
  return "unsupported";
}

/** The VAPID public key arrives base64url-encoded; `pushManager.subscribe` wants raw bytes. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
