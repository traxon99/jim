import type { StravaActivity } from "@jim/core";

// Strava's HTTP API (issue #836), over the global fetch so tests can fake it
// at the network boundary. Every call has a timeout (#684).

const API = "https://www.strava.com";
const TIMEOUT_MS = 15_000;

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface StravaAthlete {
  id: string;
  name: string | null;
}

/** A Strava call that didn't succeed; `status` is 0 when the network failed. */
export class StravaApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }

  /** Access was revoked or the token is no longer valid. */
  get unauthorized(): boolean {
    return this.status === 401;
  }

  /** Worth another attempt later: rate limited, Strava down or unreachable. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

async function call(path: string, init: RequestInit & { token?: string }): Promise<unknown> {
  const { token, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...rest,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...((rest.headers as Record<string, string> | undefined) ?? {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new StravaApiError(0, "Strava is unreachable");
  }
  if (!response.ok) throw new StravaApiError(response.status, `Strava answered ${response.status}`);
  return response.status === 204 ? null : response.json().catch(() => null);
}

function form(values: Record<string, string | number | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) params.set(name, String(value));
  }
  return params;
}

interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  athlete?: { id?: unknown; firstname?: unknown; lastname?: unknown };
}

function readTokens(body: unknown): StravaTokens {
  const t = body as TokenResponse | null;
  if (
    !t ||
    typeof t.access_token !== "string" ||
    typeof t.refresh_token !== "string" ||
    typeof t.expires_at !== "number"
  ) {
    throw new StravaApiError(502, "Strava sent an unexpected token response");
  }
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: new Date(t.expires_at * 1000),
  };
}

export async function exchangeCode(
  credentials: { clientId: string; clientSecret: string },
  code: string,
): Promise<StravaTokens & { athlete: StravaAthlete }> {
  const body = (await call("/oauth/token", {
    method: "POST",
    body: form({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  })) as TokenResponse;
  const tokens = readTokens(body);
  const id = body.athlete?.id;
  if (typeof id !== "number" && typeof id !== "string") {
    throw new StravaApiError(502, "Strava sent no athlete");
  }
  const name = [body.athlete?.firstname, body.athlete?.lastname]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ");
  return { ...tokens, athlete: { id: String(id), name: name || null } };
}

export async function refreshTokens(
  credentials: { clientId: string; clientSecret: string },
  refreshToken: string,
): Promise<StravaTokens> {
  return readTokens(
    await call("/oauth/token", {
      method: "POST",
      body: form({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    }),
  );
}

/** Strava's own "this app no longer has access" call. */
export async function deauthorize(accessToken: string): Promise<void> {
  await call("/oauth/deauthorize", { method: "POST", token: accessToken });
}

/** Succeeds while the token is still valid; a 401 means access was revoked. */
export async function checkAthlete(accessToken: string): Promise<void> {
  await call("/api/v3/athlete", { method: "GET", token: accessToken });
}

export async function createActivity(
  accessToken: string,
  activity: StravaActivity,
): Promise<string> {
  const body = (await call("/api/v3/activities", {
    method: "POST",
    token: accessToken,
    body: form({
      name: activity.name,
      sport_type: activity.sport_type,
      start_date_local: activity.start_date_local,
      elapsed_time: activity.elapsed_time,
      description: activity.description,
      distance: activity.distance,
    }),
  })) as { id?: unknown } | null;
  const id = body?.id;
  if (typeof id !== "number" && typeof id !== "string") {
    throw new StravaApiError(502, "Strava sent no activity id");
  }
  return String(id);
}
