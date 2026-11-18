import { type JimDatabase, db } from "../db/schema";
import { drainPhotoUploads } from "../photos/upload-queue";
import { drainOutbox } from "../sync/engine";

/**
 * Tries to push any queued mutations before the local database is wiped,
 * and returns how many are still unsynced afterwards (0 = nothing to lose).
 */
export async function flushOutboxBeforeSignOut(
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  if ((await database.photoUploads.count()) > 0) {
    await drainPhotoUploads(database).catch(() => {});
  }
  if ((await database.outbox.count()) > 0) {
    await drainOutbox(database, fetchImpl);
  }
  // Photos still waiting to upload would be lost with the local database too (issue #835).
  return (await database.outbox.count()) + (await database.photoUploads.count());
}

/**
 * Deletes the whole local-first database — every synced table, the sync
 * cursor and the outbox. It's shared by whoever signs in on this device
 * (the Dexie db isn't per-user), so leaving it behind would show the next
 * account the previous one's data and pull from the wrong cursor.
 */
export async function clearLocalData(database: JimDatabase = db): Promise<void> {
  await database.delete();
}

/**
 * Deletes the service worker's cached pages (public/sw.template.js
 * PAGES_CACHE) and the cached progress photos. They're the signed-in user's,
 * so they mustn't outlive the session (#661, #289).
 */
export async function clearCachedPages(
  cacheStorage: Pick<CacheStorage, "keys" | "delete"> | undefined = globalThis.caches,
): Promise<void> {
  if (!cacheStorage) return;
  const keys = await cacheStorage.keys();
  await Promise.all(
    keys
      // The cached progress photos are the signed-in user's too (issue #835).
      .filter((key) => key.startsWith("jim-pages-") || key.startsWith("jim-photos-"))
      .map((key) => cacheStorage.delete(key)),
  );
}

/**
 * Expires every Supabase auth cookie (`sb-<ref>-auth-token`, plus its
 * `.0`/`.1` chunks). A fallback for when `signOut()` itself fails — e.g. the
 * revoke request can't reach Supabase — since supabase-js then keeps the
 * session and proxy.ts would keep bouncing /login back to the app.
 */
export function clearAuthCookies(doc: Pick<Document, "cookie"> = document): void {
  for (const pair of doc.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim();
    if (name?.startsWith("sb-")) {
      doc.cookie = `${name}=; Max-Age=0; path=/`;
    }
  }
}
