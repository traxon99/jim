// postbuild step (see package.json), after generate-sw.mjs. Sends the
// "Jim updated" Web Push to every subscribed device, which is what lets it
// arrive while Jim is closed: the push service wakes each device's service
// worker, and public/sw.template.js shows the notification.
//
// Production deploys only. Preview builds share the production database
// (same reasoning as prebuild.mjs), and a local `pnpm build` must never
// push to real users. Never fails the build: a deploy matters more than
// its notification.
import postgres from "postgres";
import { releasePushMessage } from "../lib/pwa/notifications";
import { type StoredSubscription, fanOutPush } from "../lib/pwa/send-push";
import { configureWebPush, webpush } from "../lib/pwa/web-push-server";

async function main() {
  if (process.env.VERCEL_ENV !== "production") {
    console.log("[release-push] Not a Vercel production build; skipping.");
    return;
  }

  if (!configureWebPush()) {
    console.log("[release-push] VAPID keys not configured (see .env.example); skipping.");
    return;
  }

  // The migration role (not the per-user RLS path the API uses): this is
  // the one reader that legitimately needs every user's subscriptions.
  const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.log("[release-push] No database URL; skipping.");
    return;
  }

  const sql = postgres(url, { max: 1, prepare: false, ssl: "prefer", onnotice: () => {} });
  try {
    const subscriptions = await sql<StoredSubscription[]>`
      SELECT endpoint, p256dh, auth FROM push_subscriptions
    `;
    const result = await fanOutPush(subscriptions, releasePushMessage(), (sub, payload) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        // Topic: a device that's offline gets only the newest release push,
        // not one per deploy it missed. TTL: after a day it's stale news.
        { TTL: 60 * 60 * 24, topic: "jim-release", urgency: "normal" },
      ),
    );
    if (result.expired.length > 0) {
      await sql`DELETE FROM push_subscriptions WHERE endpoint IN ${sql(result.expired)}`;
    }
    console.log(
      `[release-push] Sent ${result.sent}, failed ${result.failed}, removed ${result.expired.length} expired.`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[release-push] Failed; the deploy continues without it:", error);
});
