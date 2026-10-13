import { type Result, apiRequest } from "@/lib/api/client";
import type { ShareSnapshot } from "@jim/core";
import type { OpenedShareLink, OwnShareLink } from "./types";

export type { Result } from "@/lib/api/client";

// Share links live on the server (issue #254): creating, opening and revoking
// one each need a connection, and each call says so when there isn't one.

export async function createShareLink(
  snapshot: ShareSnapshot,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<string>> {
  const result = await apiRequest<{ id: string }>(
    "/api/shares",
    { method: "POST", body: JSON.stringify({ snapshot }) },
    "Couldn't create the link",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.id } : result;
}

export function openShareLink(id: string, fetchImpl: typeof fetch = fetch) {
  return apiRequest<OpenedShareLink>(
    `/api/shares/${encodeURIComponent(id)}`,
    undefined,
    "Couldn't open this link",
    fetchImpl,
  );
}

export async function fetchOwnShareLinks(
  fetchImpl: typeof fetch = fetch,
): Promise<Result<OwnShareLink[]>> {
  const result = await apiRequest<{ links: OwnShareLink[] }>(
    "/api/shares",
    undefined,
    "Couldn't load your shared links",
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.links } : result;
}

export function revokeShareLink(id: string, fetchImpl: typeof fetch = fetch) {
  return apiRequest<{ ok: true }>(
    `/api/shares/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    "Couldn't revoke the link",
    fetchImpl,
  );
}

/**
 * The path a share link opens in Jim. `from` names the screen it was opened
 * from so the preview's Back button returns there.
 */
export function sharePath(id: string, from?: ShareOrigin): string {
  return from ? `/share/${id}?from=${from}` : `/share/${id}`;
}

export type ShareOrigin = "settings";

/** Where the share preview's Back button goes: the screen named by `?from=`, else Routines. */
export function shareBackTarget(from: string | undefined): { href: string; label: string } {
  if (from === "settings") return { href: "/profile/settings", label: "Settings" };
  return { href: "/routines", label: "Routines" };
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
