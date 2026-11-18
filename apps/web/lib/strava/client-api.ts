import { type Result, apiRequest } from "@/lib/api/client";
import type { StravaPostInfo } from "@jim/core";

// The phone's calls to the Strava routes (issue #836). Server data like
// friends: online-only, never written to IndexedDB, so each call can fail
// offline and says so.

export interface StravaConnectionInfo {
  /** False when this server has no Strava credentials. */
  configured: boolean;
  connected: boolean;
  athleteName: string | null;
  autoPost: boolean;
}

export function fetchStravaConnection(fetchImpl: typeof fetch = fetch) {
  return apiRequest<StravaConnectionInfo>(
    "/api/strava/connection",
    undefined,
    "Couldn't load Strava",
    fetchImpl,
  );
}

export async function setStravaAutoPost(
  autoPost: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<null>> {
  try {
    const response = await fetchImpl("/api/strava/connection", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ autoPost }),
    });
    return response.ok
      ? { ok: true, value: null }
      : { ok: false, error: "Couldn't save. Try again." };
  } catch {
    return { ok: false, error: "No connection. Try again once you're back online." };
  }
}

export async function disconnectStrava(fetchImpl: typeof fetch = fetch): Promise<Result<null>> {
  try {
    const response = await fetchImpl("/api/strava/connection", { method: "DELETE" });
    return response.ok
      ? { ok: true, value: null }
      : { ok: false, error: "Couldn't disconnect. Try again." };
  } catch {
    return { ok: false, error: "No connection. Try again once you're back online." };
  }
}

export async function fetchStravaActivities(
  sessionIds: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Result<Record<string, StravaPostInfo>>> {
  const result = await apiRequest<{ activities: Record<string, StravaPostInfo> }>(
    `/api/strava/activities?session_ids=${sessionIds.join(",")}`,
    undefined,
    "Couldn't load Strava",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.activities } : result;
}

export async function retryStravaPost(
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<null>> {
  try {
    const response = await fetchImpl("/api/strava/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    return response.ok
      ? { ok: true, value: null }
      : { ok: false, error: "Couldn't retry. Try again." };
  } catch {
    return { ok: false, error: "No connection. Try again once you're back online." };
  }
}
