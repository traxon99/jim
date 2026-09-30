import type { AccessTokenExpiryDays } from "@jim/core";
import type { AccessTokenEntry, CreatedAccessToken } from "./types";

// Access tokens are server data (issue #246), like friends: nothing is kept
// in IndexedDB, so each call can fail offline and says so.

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const OFFLINE = "No connection — try again once you're back online";

async function request<T>(
  init: RequestInit | undefined,
  fallbackError: string,
  fetchImpl: typeof fetch,
): Promise<Result<T>> {
  try {
    const response = await fetchImpl("/api/access-tokens", {
      ...init,
      headers: init?.body ? { "content-type": "application/json" } : undefined,
    });
    const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok || body === null) {
      return { ok: false, error: body?.error ?? fallbackError };
    }
    return { ok: true, value: body };
  } catch {
    return { ok: false, error: OFFLINE };
  }
}

export async function fetchAccessTokens(
  fetchImpl: typeof fetch = fetch,
): Promise<Result<AccessTokenEntry[]>> {
  const result = await request<{ tokens: AccessTokenEntry[] }>(
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
  return request<CreatedAccessToken>(
    { method: "POST", body: JSON.stringify({ name, expiresInDays }) },
    "Couldn't create the token",
    fetchImpl,
  );
}

export async function revokeAccessToken(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<boolean>> {
  const result = await request<{ ok: boolean }>(
    { method: "DELETE", body: JSON.stringify({ id }) },
    "Couldn't revoke the token",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.ok } : result;
}
