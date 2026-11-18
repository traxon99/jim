/**
 * Strava's app credentials and the secret that encrypts stored tokens
 * (issue #836). Without them the Settings row says Strava isn't set up, like
 * push without VAPID keys. Env var names never reach a response (#504).
 */
export interface StravaConfig {
  clientId: string;
  clientSecret: string;
  tokenKey: string;
}

export function stravaConfig(): StravaConfig | null {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const tokenKey = process.env.STRAVA_TOKEN_KEY;
  if (!clientId || !clientSecret || !tokenKey) return null;
  return { clientId, clientSecret, tokenKey };
}

/** Posting also needs QStash, which delivers each post as its own retried job. */
export function stravaPostingConfigured(): boolean {
  return (
    stravaConfig() !== null &&
    Boolean(process.env.QSTASH_TOKEN) &&
    Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY) &&
    Boolean(process.env.QSTASH_NEXT_SIGNING_KEY)
  );
}

/** QStash's callback for one workout's post, built from the request URL like the push fire routes. */
export function stravaPostUrl(requestUrl: string): string {
  return new URL("/api/strava/post", requestUrl).href;
}

export interface StravaPostPayload {
  userId: string;
  sessionId: string;
}

export function isStravaPostPayload(body: unknown): body is StravaPostPayload {
  if (typeof body !== "object" || body === null) return false;
  const { userId, sessionId } = body as Record<string, unknown>;
  return (
    typeof userId === "string" &&
    userId.length > 0 &&
    typeof sessionId === "string" &&
    sessionId.length > 0
  );
}
