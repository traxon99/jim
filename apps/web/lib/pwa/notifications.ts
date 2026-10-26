import { IDLE_REMINDER_MINUTES, formatIdleMinutes } from "@jim/core";

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
 * place the notification's content lives. A production deploy pushes it to
 * everyone with What's new on, only when it changed, and at most once a day
 * unless they picked every deploy (scripts/send-release-push.ts,
 * `shouldSendReleasePush`).
 */
export const LATEST_RELEASE_NOTE =
  "The floating tab bar is now see-through glass, so your page shows softly behind it.";

/** At most one "What's new" push per this long (issue #668). */
export const RELEASE_PUSH_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Whether this deploy sends the "What's new" push (issue #668). The repo
 * ships several times a day, so a push per deploy buried the rest timer in
 * update banners. Sends only a note that differs from the last one sent, and
 * not within a day of it. A note held back is still unsent, so a later deploy
 * that keeps it sends it once the day is up. Users who picked every deploy
 * (issue #702) skip the day rule: `lastSent` is then the last push sent to
 * them, and any new note goes out on the deploy that ships it.
 */
export function shouldSendReleasePush(
  note: string,
  lastSent: { note: string; sentAt: Date } | undefined,
  now: Date,
  audience: ReleasePushAudience = "daily",
): boolean {
  if (!note) return false;
  if (!lastSent) return true;
  if (lastSent.note === note) return false;
  if (audience === "every_deploy") return true;
  return now.getTime() - lastSent.sentAt.getTime() >= RELEASE_PUSH_MIN_INTERVAL_MS;
}

/** Who a "What's new" push goes to: `release_pushes.audience`. */
export type ReleasePushAudience = "daily" | "every_deploy";

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

/**
 * Sent when an active workout has gone `IDLE_REMINDER_MINUTES` with no
 * activity (issue #648), scheduled through QStash like the rest timer
 * (app/api/push/workout-idle). Tapping it opens the workout to finish it.
 */
export function idleWorkoutMessage(sessionId: string): PushMessage {
  return {
    title: "Still working out?",
    body: `Nothing logged for ${formatIdleMinutes(IDLE_REMINDER_MINUTES)}. Open Jim to finish your workout.`,
    url: `/workout/${sessionId}`,
    tag: "jim-workout-idle",
  };
}

/**
 * Sent at the user's auto-end time (Settings → Workout, issue #648). The
 * phone ends the workout itself the next time Jim runs, dated to its last
 * activity, so the summary shows the time actually spent. Same tag as the
 * reminder, so it replaces it.
 */
export function workoutAutoEndedMessage(sessionId: string, autoEndMinutes: number): PushMessage {
  return {
    title: "Workout ended",
    body: `No activity for ${formatIdleMinutes(autoEndMinutes)}, so Jim ended your workout.`,
    url: `/workout/${sessionId}`,
    tag: "jim-workout-idle",
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
