import { OFFLINE_MESSAGE } from "@/lib/api/client";
import { type JimDatabase, type SettingsRow, db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "./defaults";

/**
 * Fetches the user's settings row and caches it to Dexie so plate math and
 * the rest timer default keep working offline after the first successful
 * fetch (see schema.ts's `SettingsRow` doc comment for why this isn't an
 * outbox table). Silently leaves the existing cache (or the built-in
 * defaults) in place on failure — a stale bar weight is a much smaller
 * problem than blocking logging on a network call.
 */
type SettingsPayload = Omit<SettingsRow, "id" | "dprPromptDismissedAt" | "onboardedAt"> & {
  dprPromptDismissedAt?: string | null;
  onboardedAt?: string | null;
  timeZone?: string | null;
};

/** The API sends timestamps as ISO strings; the cached row keeps Dates. */
function toCachedRow(payload: SettingsPayload): SettingsRow {
  const { timeZone: _timeZone, ...fields } = payload;
  const dismissed = payload.dprPromptDismissedAt;
  const onboarded = payload.onboardedAt;
  return {
    ...DEFAULT_SETTINGS,
    ...fields,
    id: "me",
    dprPromptDismissedAt: dismissed ? new Date(dismissed) : null,
    onboardedAt: onboarded ? new Date(onboarded) : null,
  };
}

export async function refreshSettings(
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    const response = await fetchImpl("/api/settings");
    if (!response.ok) return;
    const payload = (await response.json()) as SettingsPayload;
    await database.settings.put(toCachedRow(payload));
    await reportTimeZone(payload.timeZone ?? null, fetchImpl);
  } catch {
    // Offline or logged out — the cached/default row stands.
  }
}

/** The zone this device is in, e.g. "America/Los_Angeles", or null if unknown. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Tells the server which time zone the phone is in when it changed (issue
 * #511), so the MCP server's weekly summaries split weeks where the app
 * does. Best effort: a failure just tries again on the next refresh.
 */
async function reportTimeZone(stored: string | null, fetchImpl: typeof fetch): Promise<void> {
  const timeZone = deviceTimeZone();
  if (!timeZone || timeZone === stored) return;
  await fetchImpl("/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ timeZone }),
  });
}

export async function patchSettings(
  patch: Partial<Omit<SettingsRow, "id">>,
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetchImpl("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: body?.error ?? "Failed to save settings" };
    }
    const payload = (await response.json()) as SettingsPayload;
    await database.settings.put(toCachedRow(payload));
    return { ok: true };
  } catch {
    return { ok: false, error: OFFLINE_MESSAGE };
  }
}

export async function getCachedSettings(database: JimDatabase = db): Promise<SettingsRow> {
  return (await database.settings.get("me")) ?? DEFAULT_SETTINGS;
}
