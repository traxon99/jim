import type { ShareSnapshot } from "@jim/core";
import type { OpenedShareLink, OwnShareLink } from "./types";

// Share links live on the server (issue #254): creating, opening and revoking
// one each need a connection, and each call says so when there isn't one.

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const OFFLINE = "No connection. Try again once you're back online.";

async function request<T>(
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
    return { ok: false, error: OFFLINE };
  }
}

export async function createShareLink(
  snapshot: ShareSnapshot,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<string>> {
  const result = await request<{ id: string }>(
    "/api/shares",
    { method: "POST", body: JSON.stringify({ snapshot }) },
    "Couldn't create the link",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.id } : result;
}

export function openShareLink(id: string, fetchImpl: typeof fetch = fetch) {
  return request<OpenedShareLink>(
    `/api/shares/${encodeURIComponent(id)}`,
    undefined,
    "Couldn't open this link",
    fetchImpl,
  );
}

export async function fetchOwnShareLinks(
  fetchImpl: typeof fetch = fetch,
): Promise<Result<OwnShareLink[]>> {
  const result = await request<{ links: OwnShareLink[] }>(
    "/api/shares",
    undefined,
    "Couldn't load your shared links",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.links } : result;
}

export function revokeShareLink(id: string, fetchImpl: typeof fetch = fetch) {
  return request<{ ok: true }>(
    `/api/shares/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    "Couldn't revoke the link",
    fetchImpl,
  );
}

/** The path a share link opens in Jim. */
export function sharePath(id: string): string {
  return `/share/${id}`;
}

const SHARE_ID_PATTERN =
  /\/share\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;
const BARE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The link id in a pasted share link (or a bare id), or null when it isn't one. */
export function shareIdFromText(text: string): string | null {
  const trimmed = text.trim();
  if (BARE_ID_PATTERN.test(trimmed)) return trimmed.toLowerCase();
  return SHARE_ID_PATTERN.exec(trimmed)?.[1]?.toLowerCase() ?? null;
}
