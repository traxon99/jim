import {
  type DbOrTx,
  markStravaFailed,
  queueStravaPosts,
  requeueFailedStravaPost,
  sessions,
  stravaActivities,
  stravaConnections,
} from "@jim/db";
import { and, eq, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";

/**
 * Strava sync (issue #836). The connection is made in the app (Settings →
 * Account → Strava), so Claude can read its state and post workouts but not
 * connect it. Posting is a QStash message to the web app's
 * `/api/strava/post`, which holds the tokens and does the Strava call; the
 * strava_activities row it claims keeps a workout from posting twice.
 */

const QSTASH_DEFAULT_URL = "https://qstash.upstash.io";
const POST_DELAY_SECONDS = 20;

/** What publishing needs: the QStash token and the web app's public URL. */
export function stravaQueueConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN) && Boolean(process.env.JIM_WEB_URL);
}

async function publishPost(userId: string, sessionId: string): Promise<void> {
  const destination = new URL("/api/strava/post", process.env.JIM_WEB_URL).href;
  const base = (process.env.QSTASH_URL || QSTASH_DEFAULT_URL).replace(/\/$/, "");
  const response = await fetch(`${base}/v2/publish/${destination}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
      "content-type": "application/json",
      "upstash-delay": `${POST_DELAY_SECONDS}s`,
      "upstash-retries": "4",
    },
    body: JSON.stringify({ userId, sessionId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`QStash answered ${response.status}`);
}

/**
 * Queues a workout `log_past_workout` just wrote, when the user is connected
 * to Strava and their setting says to post. Treated as "logged now", so a
 * workout from last week still posts. Never throws: a Strava problem must not
 * fail the log.
 */
export async function queueLoggedWorkoutForStrava(
  context: UserContext,
  sessionId: string,
): Promise<void> {
  if (!stravaQueueConfigured()) return;
  try {
    const queued = await queueStravaPosts(context.db, context.userId, [sessionId], {
      loggedNow: true,
    });
    for (const id of queued) {
      try {
        await publishPost(context.userId, id);
      } catch (error) {
        // Left failed, so the phone offers Retry.
        console.error("[strava] publishing a post failed:", error);
        await markStravaFailed(context.db, id, "Couldn't queue the post");
      }
    }
  } catch (error) {
    console.error("[strava] queueing a logged workout failed:", error);
  }
}

export async function getStravaStatus(context: UserContext, input: { workoutId?: string }) {
  const [connection] = await context.db
    .select({
      athleteName: stravaConnections.athleteName,
      autoPost: stravaConnections.autoPost,
      connectedAt: stravaConnections.createdAt,
    })
    .from(stravaConnections)
    .where(eq(stravaConnections.userId, context.userId));

  let workout: {
    id: string;
    status: string;
    stravaActivityId: string | null;
    url: string | null;
    error: string | null;
  } | null = null;
  if (input.workoutId) {
    const [row] = await context.db
      .select()
      .from(stravaActivities)
      .where(
        and(
          eq(stravaActivities.userId, context.userId),
          eq(stravaActivities.sessionId, input.workoutId),
        ),
      );
    workout = {
      id: input.workoutId,
      status: row?.status ?? "not_posted",
      stravaActivityId: row?.stravaActivityId ?? null,
      url: row?.stravaActivityId
        ? `https://www.strava.com/activities/${row.stravaActivityId}`
        : null,
      error: row?.error ?? null,
    };
  }
  return {
    connected: Boolean(connection),
    athleteName: connection?.athleteName ?? null,
    autoPost: connection?.autoPost ?? false,
    connectedAt: connection?.connectedAt.toISOString() ?? null,
    workout,
  };
}

/**
 * Posts one finished workout to Strava, like the History "Post to Strava"
 * action: marks it to post (so the phone agrees after its next sync), records
 * it and queues the post. Strava's API can't delete an activity, so this
 * previews by default.
 */
export async function postWorkoutToStrava(
  context: UserContext,
  input: { workoutId: string; dryRun?: boolean },
) {
  const dryRun = input.dryRun ?? true;
  const [connection] = await context.db
    .select({ userId: stravaConnections.userId })
    .from(stravaConnections)
    .where(eq(stravaConnections.userId, context.userId));
  if (!connection) {
    throw new Error("Strava isn't connected. Connect it in the app: Settings → Account → Strava.");
  }
  if (!stravaQueueConfigured()) {
    throw new Error("Posting to Strava isn't set up on the MCP server.");
  }

  const result = await withUserWrite(context, dryRun, async (tx: DbOrTx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, input.workoutId));
    if (!session || session.deletedAt) {
      throw new Error(`No workout found with id ${input.workoutId}. Try list_workouts.`);
    }
    if (!session.endedAt) {
      throw new Error("That workout is still in progress on the phone. Finish it there first.");
    }
    const now = new Date();
    await tx
      .update(sessions)
      .set({
        stravaPost: true,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(sessions.id, session.id));
    return { id: session.id, name: session.name, startedAt: session.startedAt.toISOString() };
  });
  if (dryRun) return { ...result, alreadyOnStrava: false, queued: false };

  const [existing] = await context.db
    .select({ status: stravaActivities.status })
    .from(stravaActivities)
    .where(eq(stravaActivities.sessionId, input.workoutId));
  const queued = await queueStravaPosts(context.db, context.userId, [input.workoutId]);
  // A post that failed before is put back in the queue.
  if (
    existing?.status === "failed" &&
    (await requeueFailedStravaPost(context.db, context.userId, input.workoutId))
  ) {
    queued.push(input.workoutId);
  }
  for (const id of queued) await publishPost(context.userId, id);
  return {
    ...result,
    alreadyOnStrava: existing?.status === "posted",
    queued: queued.length > 0,
  };
}
