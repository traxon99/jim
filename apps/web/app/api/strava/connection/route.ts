import { readJsonObject, unauthenticatedOrThrow } from "@/lib/api/route-helpers";
import { requireUserId } from "@/lib/strava/auth";
import { deauthorize } from "@/lib/strava/client";
import { stravaConfig } from "@/lib/strava/config";
import {
  deleteStravaConnection,
  getStravaConnection,
  setStravaAutoPost,
  validAccessToken,
} from "@/lib/strava/connection";
import { NextResponse } from "next/server";

/**
 * Settings' view of the Strava link (issue #836): whether Strava is set up on
 * this server, whether the account is connected, as whom, and whether
 * workouts post by themselves. Never carries a token.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const config = stravaConfig();
    if (!config) {
      return NextResponse.json({
        configured: false,
        connected: false,
        athleteName: null,
        autoPost: false,
      });
    }
    const connection = await getStravaConnection(userId);
    return NextResponse.json({
      configured: true,
      connected: Boolean(connection),
      athleteName: connection?.athleteName ?? null,
      autoPost: connection?.autoPost ?? false,
    });
  } catch (error) {
    return unauthenticatedOrThrow(error);
  }
}

/** The "Auto-post to Strava" switch. */
export async function PATCH(request: Request) {
  const body = await readJsonObject(request);
  if (!body || typeof body.autoPost !== "boolean") {
    return NextResponse.json({ error: "Expected { autoPost: boolean }" }, { status: 400 });
  }
  try {
    const userId = await requireUserId();
    const updated = await setStravaAutoPost(userId, body.autoPost);
    if (!updated) return NextResponse.json({ error: "Strava isn't connected" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return unauthenticatedOrThrow(error);
  }
}

/**
 * Disconnects: tells Strava to drop Jim's access, then forgets the tokens.
 * The row goes even when Strava can't be reached (or already revoked it), so
 * Jim never holds on to a token the user asked it to forget.
 */
export async function DELETE() {
  try {
    const userId = await requireUserId();
    const config = stravaConfig();
    const connection = await getStravaConnection(userId);
    if (connection && config) {
      try {
        const token = await validAccessToken(connection, config);
        if (token) await deauthorize(token);
      } catch (error) {
        console.error("[strava] deauthorize failed:", error);
      }
    }
    await deleteStravaConnection(userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return unauthenticatedOrThrow(error);
  }
}
