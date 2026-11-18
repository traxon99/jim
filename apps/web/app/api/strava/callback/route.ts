import { unauthenticatedOrThrow } from "@/lib/api/route-helpers";
import { requireUserId } from "@/lib/strava/auth";
import { StravaApiError, exchangeCode } from "@/lib/strava/client";
import { stravaConfig } from "@/lib/strava/config";
import { saveStravaConnection } from "@/lib/strava/connection";
import { verifyState } from "@/lib/strava/crypto";
import { NextResponse } from "next/server";

const SETTINGS_PATH = "/profile/settings/account";

function back(requestUrl: string, result: "connected" | "error" | "denied") {
  const url = new URL(SETTINGS_PATH, requestUrl);
  url.searchParams.set("strava", result);
  return NextResponse.redirect(url);
}

/**
 * Strava sends the user back here with a one-time code (issue #836). The code
 * is exchanged for tokens, which are stored encrypted and never shown to the
 * phone. The user must also have left the `activity:write` box ticked.
 */
export async function GET(request: Request) {
  const config = stravaConfig();
  if (!config) return NextResponse.json({ error: "Strava is not set up" }, { status: 503 });
  try {
    const userId = await requireUserId();
    const params = new URL(request.url).searchParams;
    if (params.get("error")) return back(request.url, "denied");
    const code = params.get("code");
    if (!code || !verifyState(params.get("state"), userId, config.tokenKey)) {
      return back(request.url, "error");
    }
    const scope = params.get("scope");
    if (!scope?.split(",").includes("activity:write")) return back(request.url, "denied");

    try {
      const exchanged = await exchangeCode(config, code);
      await saveStravaConnection(userId, config, {
        athleteId: exchanged.athlete.id,
        athleteName: exchanged.athlete.name,
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
        expiresAt: exchanged.expiresAt,
        scope,
      });
    } catch (error) {
      if (!(error instanceof StravaApiError)) throw error;
      return back(request.url, "error");
    }
    return back(request.url, "connected");
  } catch (error) {
    return unauthenticatedOrThrow(error);
  }
}
