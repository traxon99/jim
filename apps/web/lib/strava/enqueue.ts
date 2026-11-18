import { serviceDb } from "@/lib/db/user-scoped";
import { markStravaFailed, queueStravaPosts } from "@jim/db";
import { Client } from "@upstash/qstash";
import { type StravaPostPayload, stravaPostUrl, stravaPostingConfigured } from "./config";

/**
 * A little after the finish so the toggle on the finish screen can still skip
 * this workout, and any sets still in flight have landed.
 */
const POST_DELAY_SECONDS = 20;

/** QStash retries a post that Strava rate-limited or couldn't take, with backoff. */
const POST_RETRIES = 4;

/** Publishes one workout's post job; the QStash callback is POST /api/strava/post. */
export async function publishStravaPost(
  requestUrl: string,
  payload: StravaPostPayload,
): Promise<void> {
  await new Client().publishJSON({
    url: stravaPostUrl(requestUrl),
    body: payload,
    delay: POST_DELAY_SECONDS,
    retries: POST_RETRIES,
  });
}

/**
 * After a push commits finished workouts (or `log_past_workout` does), records
 * and publishes a Strava post for each that should go (issue #836). Never
 * throws: Strava must not fail a sync. A workout whose message couldn't be
 * published is left `failed`, so the phone offers Retry.
 */
export async function enqueueStravaPosts(
  requestUrl: string,
  userId: string,
  sessionIds: readonly string[],
): Promise<void> {
  if (sessionIds.length === 0 || !stravaPostingConfigured()) return;
  try {
    const db = serviceDb();
    const queued = await queueStravaPosts(db, userId, sessionIds);
    for (const sessionId of queued) {
      try {
        await publishStravaPost(requestUrl, { userId, sessionId });
      } catch (error) {
        console.error("[strava] publishing a post failed:", error);
        await markStravaFailed(db, sessionId, "Couldn't queue the post");
      }
    }
  } catch (error) {
    console.error("[strava] queueing posts failed:", error);
  }
}
