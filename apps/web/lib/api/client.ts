// The client side of the server-data routes (friends, access tokens, share
// links): nothing is written to IndexedDB first, so each call can fail
// offline and says so (#553: these each had their own copy).

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const OFFLINE_MESSAGE = "No connection. Try again once you're back online.";

/** JSON request to one of Jim's API routes, with the route's `error` or `fallbackError` on failure. */
export async function apiRequest<T>(
  path: string,
  init: RequestInit | undefined,
  fallbackError: string,
  fetchImpl: typeof fetch,
): Promise<Result<T>> {
  try {
    const response = await fetchImpl(path, {
      ...init,
      headers: init?.body ? { "content-type": "application/json" } : undefined,
    });
    const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok || body === null) {
      return { ok: false, error: body?.error ?? fallbackError };
    }
    return { ok: true, value: body };
  } catch {
    return { ok: false, error: OFFLINE_MESSAGE };
  }
}
