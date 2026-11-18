import { unauthenticatedOrThrow } from "@/lib/api/route-helpers";
import { requireUserId } from "@/lib/strava/auth";
import { stravaConfig } from "@/lib/strava/config";
import { signState } from "@/lib/strava/crypto";
import { NextResponse } from "next/server";

/**
 * Starts Connect Strava (issue #836): sends the signed-in user to Strava's own
 * sign-in page, so a Strava password never touches Jim. The signed `state`
 * ties the round trip to this user. 503 when Strava isn't set up.
 */
export async function GET(request: Request) {
  const config = stravaConfig();
  if (!config) return NextResponse.json({ error: "Strava is not set up" }, { status: 503 });
  try {
    const userId = await requireUserId();
    const authorize = new URL("https://www.strava.com/oauth/authorize");
    authorize.searchParams.set("client_id", config.clientId);
    authorize.searchParams.set("redirect_uri", new URL("/api/strava/callback", request.url).href);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("approval_prompt", "auto");
    authorize.searchParams.set("scope", "activity:write");
    authorize.searchParams.set("state", signState(userId, config.tokenKey));
    return NextResponse.redirect(authorize);
  } catch (error) {
    return unauthenticatedOrThrow(error);
  }
}
