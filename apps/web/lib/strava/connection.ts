import { serviceDb } from "@/lib/db/user-scoped";
import { stravaConnections } from "@jim/db";
import { eq } from "drizzle-orm";
import { StravaApiError, refreshTokens } from "./client";
import { type StravaConfig, stravaConfig } from "./config";
import { decryptToken, encryptToken } from "./crypto";

// The server's own connection reaches strava_connections: it has RLS and no
// policies, so tokens never leave the server (ADR-023 pattern, issue #836).
// Callers verify the signed-in user (or the QStash signature) first.

/** Refreshed on use when this close to expiring. */
const REFRESH_WINDOW_MS = 5 * 60_000;

export async function getStravaConnection(userId: string) {
  const [row] = await serviceDb()
    .select()
    .from(stravaConnections)
    .where(eq(stravaConnections.userId, userId));
  return row;
}

export async function saveStravaConnection(
  userId: string,
  config: StravaConfig,
  connection: {
    athleteId: string;
    athleteName: string | null;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    scope: string | null;
  },
): Promise<void> {
  const values = {
    athleteId: connection.athleteId,
    athleteName: connection.athleteName,
    accessTokenEnc: encryptToken(connection.accessToken, config.tokenKey),
    refreshTokenEnc: encryptToken(connection.refreshToken, config.tokenKey),
    expiresAt: connection.expiresAt,
    scope: connection.scope,
  };
  // Reconnecting keeps the original created_at and the auto-post choice.
  await serviceDb()
    .insert(stravaConnections)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: stravaConnections.userId, set: values });
}

export async function deleteStravaConnection(userId: string): Promise<void> {
  await serviceDb().delete(stravaConnections).where(eq(stravaConnections.userId, userId));
}

export async function setStravaAutoPost(userId: string, autoPost: boolean): Promise<boolean> {
  const rows = await serviceDb()
    .update(stravaConnections)
    .set({ autoPost })
    .where(eq(stravaConnections.userId, userId))
    .returning({ userId: stravaConnections.userId });
  return rows.length > 0;
}

/**
 * A usable access token for the connection, refreshed (and the new tokens
 * stored) when within five minutes of expiry. Null when the stored tokens
 * can't be decrypted, which reads as disconnected.
 */
export async function validAccessToken(
  connection: NonNullable<Awaited<ReturnType<typeof getStravaConnection>>>,
  config: StravaConfig,
  now = Date.now(),
): Promise<string | null> {
  const access = decryptToken(connection.accessTokenEnc, config.tokenKey);
  if (access && connection.expiresAt.getTime() - now > REFRESH_WINDOW_MS) return access;

  const refresh = decryptToken(connection.refreshTokenEnc, config.tokenKey);
  if (!refresh) return null;
  const tokens = await refreshTokens(config, refresh);
  await serviceDb()
    .update(stravaConnections)
    .set({
      accessTokenEnc: encryptToken(tokens.accessToken, config.tokenKey),
      refreshTokenEnc: encryptToken(tokens.refreshToken, config.tokenKey),
      expiresAt: tokens.expiresAt,
    })
    .where(eq(stravaConnections.userId, connection.userId));
  return tokens.accessToken;
}

export { StravaApiError, stravaConfig };
