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
export async function refreshSettings(
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    const response = await fetchImpl("/api/settings");
    if (!response.ok) return;
    const payload = (await response.json()) as Omit<SettingsRow, "id">;
    await database.settings.put({ id: "me", ...payload });
  } catch {
    // Offline or logged out — the cached/default row stands.
  }
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
    const payload = (await response.json()) as Omit<SettingsRow, "id">;
    await database.settings.put({ id: "me", ...payload });
    return { ok: true };
  } catch {
    return { ok: false, error: "No connection — try again once you're back online" };
  }
}

export async function getCachedSettings(database: JimDatabase = db): Promise<SettingsRow> {
  return (await database.settings.get("me")) ?? DEFAULT_SETTINGS;
}
