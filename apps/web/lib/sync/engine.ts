import { type JimDatabase, type SyncMetaRow, db } from "../db/schema";
import { applyPulledRows } from "./apply-pulled-rows";
import { setSyncStatus } from "./status";

const META_ID = "meta" as const;

async function getMeta(database: JimDatabase): Promise<SyncMetaRow> {
  const existing = await database.syncMeta.get(META_ID);
  if (existing) return existing;
  const created: SyncMetaRow = { id: META_ID, cursor: 0, deviceId: crypto.randomUUID() };
  await database.syncMeta.put(created);
  return created;
}

export async function getDeviceId(database: JimDatabase = db): Promise<string> {
  return (await getMeta(database)).deviceId;
}

async function refreshStatusFromOutbox(database: JimDatabase): Promise<void> {
  const remaining = await database.outbox.count();
  setSyncStatus(remaining > 0 ? { kind: "pending", count: remaining } : { kind: "synced" });
}

/**
 * Drains the outbox to POST /api/sync/push, oldest mutation first. Applied
 * and duplicate mutations are removed; anything the server reports as an
 * error stays queued for the next cycle. A network failure or non-2xx
 * response leaves the whole outbox untouched and surfaces `error`.
 */
export async function drainOutbox(
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const entries = await database.outbox.orderBy("id").toArray();
  if (entries.length === 0) {
    setSyncStatus({ kind: "synced" });
    return;
  }

  let response: Response;
  try {
    response = await fetchImpl("/api/sync/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mutations: entries.map(({ id, table, entity }) => ({ id, table, entity })),
      }),
    });
  } catch {
    setSyncStatus({ kind: "error", count: entries.length });
    return;
  }

  if (!response.ok) {
    setSyncStatus({ kind: "error", count: entries.length });
    return;
  }

  const { results } = (await response.json()) as { results: { id: string; status: string }[] };
  const settled = results
    .filter((result) => result.status === "applied" || result.status === "duplicate")
    .map((result) => result.id);
  await database.outbox.bulkDelete(settled);

  await refreshStatusFromOutbox(database);
}

/** Pulls everything changed since the local cursor and applies it to Dexie. */
export async function pullChanges(
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const meta = await getMeta(database);

  let response: Response;
  try {
    response = await fetchImpl(`/api/sync/pull?since=${meta.cursor}`);
  } catch {
    setSyncStatus({ kind: "error", count: await database.outbox.count() });
    return;
  }
  if (!response.ok) {
    setSyncStatus({ kind: "error", count: await database.outbox.count() });
    return;
  }

  const body = (await response.json()) as { cursor: number; changes: Record<string, unknown[]> };
  for (const [tableName, rows] of Object.entries(body.changes)) {
    await applyPulledRows(database, tableName, rows);
  }
  await database.syncMeta.put({ ...meta, cursor: body.cursor });

  await refreshStatusFromOutbox(database);
}

/**
 * One full sync cycle: push before pull, so a local edit reaches the server
 * before this same cycle might otherwise pull back a now-stale version of
 * the same row from another device.
 */
export async function runSyncCycle(
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await drainOutbox(database, fetchImpl);
  await pullChanges(database, fetchImpl);
}

const SYNC_INTERVAL_MS = 60_000;

/**
 * Wires up every foreground-driven sync trigger from ADR-002 — boot,
 * `visibilitychange` → visible, `online`, and a 60s interval while
 * foregrounded. Deliberately never a `sync` event: it doesn't exist on iOS
 * Safari (see docs/ARCHITECTURE.md §2, constraint 1). Session finalize is a
 * separate trigger, not wired here — S6 calls `runSyncCycle()` directly
 * when a session ends.
 *
 * Call once (e.g. from a client component's effect); returns a cleanup
 * function that removes every listener and stops the interval.
 */
export function startSyncEngine(
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
): () => void {
  const run = () => {
    void runSyncCycle(database, fetchImpl);
  };

  run();

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") run();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("online", run);
  const interval = setInterval(run, SYNC_INTERVAL_MS);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("online", run);
    clearInterval(interval);
  };
}
