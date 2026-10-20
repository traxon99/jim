import { type JimDatabase, type SyncMetaRow, db } from "../db/schema";
import { applyPulledRows } from "./apply-pulled-rows";
import { getSyncStatus, setSyncStatus } from "./status";

const META_ID = "meta" as const;

async function getMeta(database: JimDatabase): Promise<SyncMetaRow> {
  const existing = await database.syncMeta.get(META_ID);
  if (existing) return existing;
  const created: SyncMetaRow = {
    id: META_ID,
    cursor: 0,
    deviceId: crypto.randomUUID(),
    schemaVersion: database.verno,
  };
  await database.syncMeta.put(created);
  return created;
}

export async function getDeviceId(database: JimDatabase = db): Promise<string> {
  return (await getMeta(database)).deviceId;
}

/**
 * Surfaces a failed request: `signed-out` for a 401, so the user is asked to
 * sign in again rather than shown a generic error forever (#487), `offline`
 * when the request never got an answer (no signal is the normal gym-basement
 * case, not breakage, #665), `error` for anything else.
 */
async function reportFailure(
  database: JimDatabase,
  failure: { response?: Response; unreachable?: boolean } = {},
): Promise<void> {
  const count = await database.outbox.count();
  if (failure.unreachable) {
    setSyncStatus({ kind: "offline", count });
    return;
  }
  setSyncStatus(
    failure.response?.status === 401 ? { kind: "signed-out", count } : { kind: "error", count },
  );
}

/**
 * How long one sync request may take. On bad signal a hung request would
 * otherwise hold the single-flight cycle until iOS gives up, a minute or
 * more, and no later cycle could start (#684).
 */
export const SYNC_REQUEST_TIMEOUT_MS = 15_000;

function requestTimeout(): AbortSignal | undefined {
  return typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS)
    : undefined;
}

/**
 * Parses a sync response body, or returns null when it isn't the JSON the
 * route sends (e.g. a captive portal's HTML page).
 */
async function readJson<T>(response: Response): Promise<T | null> {
  if (response.redirected) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Server rejections after which a queued mutation reads as a sync error, not pending (#500). */
export const MAX_PUSH_FAILURES = 3;

async function refreshStatusFromOutbox(database: JimDatabase): Promise<void> {
  const remaining = await database.outbox.count();
  if (remaining === 0) {
    setSyncStatus({ kind: "synced" });
    return;
  }
  const stuck = await database.outbox
    .filter((entry) => (entry.failures ?? 0) >= MAX_PUSH_FAILURES)
    .count();
  setSyncStatus({ kind: stuck > 0 ? "error" : "pending", count: remaining });
}

/**
 * Mutations per push request. A Strong/Hevy import (issue #241) queues
 * thousands at once, which as one request would outgrow the serverless
 * body limit and the time the route has to apply them one by one.
 */
export const PUSH_BATCH_SIZE = 200;

/**
 * Drains the outbox to POST /api/sync/push, oldest mutation first, in
 * batches of `PUSH_BATCH_SIZE`. Applied and duplicate mutations are removed;
 * anything the server reports as an error stays queued for the next cycle.
 * A network failure or non-2xx response stops the drain, leaving that batch
 * and everything after it untouched, and surfaces `offline` or `error`.
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

  for (let start = 0; start < entries.length; start += PUSH_BATCH_SIZE) {
    const batch = entries.slice(start, start + PUSH_BATCH_SIZE);
    let response: Response;
    try {
      response = await fetchImpl("/api/sync/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mutations: batch.map(({ id, table, entity }) => ({ id, table, entity })),
        }),
        signal: requestTimeout(),
      });
    } catch {
      await reportFailure(database, { unreachable: true });
      return;
    }

    if (!response.ok) {
      await reportFailure(database, { response });
      return;
    }

    const body = await readJson<{ results: { id: string; status: string }[] }>(response);
    if (!body) {
      await reportFailure(database);
      return;
    }
    const settled = body.results
      // "stale" lost last-write-wins (#490): nothing to retry, and the pull
      // brings back the row that won.
      .filter((result) => ["applied", "duplicate", "stale"].includes(result.status))
      .map((result) => result.id);
    await database.outbox.bulkDelete(settled);

    const rejected = new Set(
      body.results.filter((result) => result.status === "error").map((result) => result.id),
    );
    await database.outbox.bulkPut(
      batch
        .filter((entry) => rejected.has(entry.id))
        .map((entry) => ({ ...entry, failures: (entry.failures ?? 0) + 1 })),
    );
  }

  await refreshStatusFromOutbox(database);
}

/**
 * Most pages one pull will fetch before yielding to the next sync cycle, so
 * a huge first sync can't hold the foreground forever; the cursor saved after
 * each page means the next cycle resumes where this one stopped.
 */
const MAX_PULL_PAGES = 50;

/**
 * Rows of a table this device didn't store yet were skipped by earlier pulls
 * while the cursor moved past them (issue #501). When the local schema is
 * newer than the one the cursor was earned under, pull from the start once;
 * applying rows is idempotent, so re-pulling what's already here is safe. A
 * cursor from before this field existed is adopted as-is.
 */
async function restartCursorAfterSchemaUpgrade(database: JimDatabase): Promise<void> {
  const meta = await getMeta(database);
  if (meta.schemaVersion === database.verno) return;
  const upgraded = meta.schemaVersion !== undefined && meta.schemaVersion < database.verno;
  await database.syncMeta.put({
    ...meta,
    cursor: upgraded ? 0 : meta.cursor,
    schemaVersion: database.verno,
  });
}

/** Pulls everything changed since the local cursor, page by page (#489), and applies it to Dexie. */
export async function pullChanges(
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await restartCursorAfterSchemaUpgrade(database);
  for (let page = 0; page < MAX_PULL_PAGES; page++) {
    const meta = await getMeta(database);

    let response: Response;
    try {
      response = await fetchImpl(`/api/sync/pull?since=${meta.cursor}`, {
        signal: requestTimeout(),
      });
    } catch {
      await reportFailure(database, { unreachable: true });
      return;
    }
    if (!response.ok) {
      await reportFailure(database, { response });
      return;
    }

    const body = await readJson<{
      cursor: number;
      hasMore?: boolean;
      changes: Record<string, unknown[]>;
    }>(response);
    if (!body) {
      await reportFailure(database);
      return;
    }
    for (const [tableName, rows] of Object.entries(body.changes)) {
      await applyPulledRows(database, tableName, rows);
    }
    await database.syncMeta.put({ ...meta, cursor: body.cursor });
    if (!body.hasMore || body.cursor <= meta.cursor) break;
  }

  await refreshStatusFromOutbox(database);
}

async function runSyncCycleOnce(database: JimDatabase, fetchImpl: typeof fetch): Promise<void> {
  await drainOutbox(database, fetchImpl);
  // A signed-out push would only be refused again by the pull, and one that
  // couldn't reach the server would only wait out another timeout.
  const { kind } = getSyncStatus();
  if (kind === "signed-out" || kind === "offline") return;
  await pullChanges(database, fetchImpl);
}

interface CycleState {
  current: Promise<void>;
  /** The one follow-up cycle callers join while `current` is still running. */
  next: Promise<void> | null;
}

/** Per database, so tests with separate scratch databases never share a guard. */
const cycles = new WeakMap<JimDatabase, CycleState>();

function startCycle(database: JimDatabase, fetchImpl: typeof fetch): Promise<void> {
  const state: CycleState = { current: runSyncCycleOnce(database, fetchImpl), next: null };
  cycles.set(database, state);
  const release = () => {
    if (cycles.get(database) === state && !state.next) cycles.delete(database);
  };
  state.current.then(release, release);
  return state.current;
}

/**
 * One full sync cycle: push before pull, so a local edit reaches the server
 * before this same cycle might otherwise pull back a now-stale version of
 * the same row from another device.
 *
 * Single-flight (#532): boot, visibility, `online`, the interval and session
 * finalize all call this, and overlapping cycles would POST the same batch
 * twice and save the pull cursor out of order. A call made while a cycle is
 * running joins one shared follow-up cycle that starts when it finishes (so
 * an edit made mid-cycle is still pushed), however many callers pile up.
 */
export function runSyncCycle(
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const state = cycles.get(database);
  if (!state) return startCycle(database, fetchImpl);
  if (!state.next) {
    state.next = state.current.catch(() => {}).then(() => startCycle(database, fetchImpl));
  }
  return state.next;
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
 * `onBootCycle` receives the boot cycle's promise, so the boot splash can
 * wait for it (components/sync-engine-boot.tsx).
 */
export function startSyncEngine(
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
  onBootCycle?: (cycle: Promise<void>) => void,
): () => void {
  const run = () => runSyncCycle(database, fetchImpl);

  const bootCycle = run();
  onBootCycle?.(bootCycle);

  const runInBackground = () => {
    run().catch((error: unknown) => {
      console.error("[sync] cycle failed:", error);
    });
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") runInBackground();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("online", runInBackground);
  const interval = setInterval(runInBackground, SYNC_INTERVAL_MS);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("online", runInBackground);
    clearInterval(interval);
  };
}
