import { type Result, apiRequest } from "@/lib/api/client";
import type { AccessTokenExpiryDays } from "@jim/core";
import type { AccessTokenEntry, CreatedAccessToken } from "./types";

// Access tokens are server data (issue #246), like friends: nothing is kept
// in IndexedDB, so each call can fail offline and says so.

export async function fetchAccessTokens(
  fetchImpl: typeof fetch = fetch,
): Promise<Result<AccessTokenEntry[]>> {
  const result = await apiRequest<{ tokens: AccessTokenEntry[] }>(
    "/api/access-tokens",
    undefined,
    "Couldn't load your access tokens",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.tokens } : result;
}

export function createAccessToken(
  name: string,
  expiresInDays: AccessTokenExpiryDays,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<CreatedAccessToken>> {
  return apiRequest<CreatedAccessToken>(
    "/api/access-tokens",
    { method: "POST", body: JSON.stringify({ name, expiresInDays }) },
    "Couldn't create the token",
    fetchImpl,
  );
}

export async function revokeAccessToken(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<boolean>> {
  const result = await apiRequest<{ ok: boolean }>(
    "/api/access-tokens",
    { method: "DELETE", body: JSON.stringify({ id }) },
    "Couldn't revoke the token",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.ok } : result;
}
