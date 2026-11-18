import { serviceDb } from "@/lib/db/user-scoped";
import { StravaApiError, checkAthlete } from "@/lib/strava/client";
import { stravaConfig } from "@/lib/strava/config";
import {
  deleteStravaConnection,
  getStravaConnection,
  validAccessToken,
} from "@/lib/strava/connection";
import { stravaConnections } from "@jim/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Strava's webhook subscription handshake (issue #836): echoes `hub.challenge`
 * when the verify token matches STRAVA_WEBHOOK_VERIFY_TOKEN.
 */
export async function GET(request: Request) {
  const verifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
  const params = new URL(request.url).searchParams;
  const challenge = params.get("hub.challenge");
  if (
    !verifyToken ||
    params.get("hub.mode") !== "subscribe" ||
    params.get("hub.verify_token") !== verifyToken ||
    !challenge
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ "hub.challenge": challenge });
}

/**
 * Strava's events. Only an athlete's deauthorization matters: the connection
 * is deleted so Settings shows it as disconnected. Strava doesn't sign these,
 * so the event is only a prompt to look: the stored token is tried against
 * Strava, and the connection goes only if Strava says it no longer works.
 * Always answers 200, or Strava retries.
 */
export async function POST(request: Request) {
  const config = stravaConfig();
  let event: Record<string, unknown> | null = null;
  try {
    event = (await request.json()) as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 200 });
  }
  const updates = (event?.updates ?? null) as Record<string, unknown> | null;
  if (
    !config ||
    event?.object_type !== "athlete" ||
    updates?.authorized !== "false" ||
    (typeof event.owner_id !== "number" && typeof event.owner_id !== "string")
  ) {
    return new NextResponse(null, { status: 200 });
  }

  try {
    const [row] = await serviceDb()
      .select({ userId: stravaConnections.userId })
      .from(stravaConnections)
      .where(eq(stravaConnections.athleteId, String(event.owner_id)));
    if (!row) return new NextResponse(null, { status: 200 });
    const connection = await getStravaConnection(row.userId);
    if (!connection) return new NextResponse(null, { status: 200 });

    let revoked = false;
    try {
      const token = await validAccessToken(connection, config);
      if (!token) revoked = true;
      else await checkAthlete(token);
    } catch (error) {
      revoked = error instanceof StravaApiError && (error.unauthorized || error.status === 400);
    }
    if (revoked) await deleteStravaConnection(row.userId);
  } catch (error) {
    console.error("[strava] webhook handling failed:", error);
  }
  return new NextResponse(null, { status: 200 });
}
