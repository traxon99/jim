import { type JimDatabase, type ProgressPhotoRow, db } from "@/lib/db/schema";
import { type PhotoStorage, supabasePhotoStorage } from "./storage";

/**
 * Where photo bytes live on this phone (issue #835):
 * - a thumbnail for every photo, in IndexedDB (`photoThumbs`), so the grid
 *   works offline;
 * - originals only on demand, in a size-capped Cache Storage bucket evicted
 *   least-recently-used.
 * A photo not yet uploaded is served from its upload-queue blobs.
 */

export const ORIGINALS_CACHE = "jim-photos-originals";
/** The cap on cached originals, roughly 100 MB. */
export const ORIGINALS_CACHE_MAX_BYTES = 100 * 1024 * 1024;
/** Missing thumbnails fetched per sync cycle, so a big first sync doesn't hog the foreground. */
const THUMB_PREFETCH_PER_CYCLE = 24;

export interface CacheEntry {
  key: string;
  bytes: number;
  lastUsed: number;
}

/** Keys to evict, least recently used first, until the rest fit in `maxBytes`. */
export function planEviction(entries: readonly CacheEntry[], maxBytes: number): string[] {
  let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  const evict: string[] = [];
  for (const entry of [...entries].sort((a, b) => a.lastUsed - b.lastUsed)) {
    if (total <= maxBytes) break;
    evict.push(entry.key);
    total -= entry.bytes;
  }
  return evict;
}

async function download(storage: PhotoStorage, path: string): Promise<Blob> {
  const url = await storage.signedUrl(path);
  if (!url) throw new Error("Couldn't reach that photo");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Couldn't load that photo");
  return response.blob();
}

/** The thumbnail: cached, else still queued on this phone, else downloaded and cached. */
export async function getThumbBlob(
  photo: ProgressPhotoRow,
  database: JimDatabase = db,
  storage?: PhotoStorage,
): Promise<Blob> {
  const cached = await database.photoThumbs.get(photo.id);
  if (cached) return cached.blob;
  const queued = await database.photoUploads.get(photo.id);
  if (queued) return queued.thumb;
  const blob = await download(storage ?? supabasePhotoStorage(), photo.thumbPath);
  await database.photoThumbs.put({ id: photo.id, blob, cachedAt: new Date() });
  return blob;
}

const originalKey = (photoId: string) => `/__photos/${photoId}/original.jpg`;

/** The full-size photo: queued on this phone, else cached, else downloaded and cached. */
export async function getOriginalBlob(
  photo: ProgressPhotoRow,
  database: JimDatabase = db,
  storage?: PhotoStorage,
): Promise<Blob> {
  const queued = await database.photoUploads.get(photo.id);
  if (queued) return queued.original;

  const cache = typeof caches === "undefined" ? null : await caches.open(ORIGINALS_CACHE);
  const key = originalKey(photo.id);
  const hit = await cache?.match(key);
  if (cache && hit) {
    const blob = await hit.blob();
    // Re-store to mark it recently used.
    void cache.put(key, stamped(blob)).catch(() => {});
    return blob;
  }

  const blob = await download(storage ?? supabasePhotoStorage(), photo.originalPath);
  if (cache) {
    try {
      await cache.put(key, stamped(blob));
      await evictOldOriginals(cache);
    } catch {
      // A full or unavailable cache only costs a re-download next time.
    }
  }
  return blob;
}

function stamped(blob: Blob): Response {
  return new Response(blob, {
    headers: {
      "content-type": "image/jpeg",
      "x-jim-bytes": String(blob.size),
      "x-jim-last-used": String(Date.now()),
    },
  });
}

async function evictOldOriginals(cache: Cache): Promise<void> {
  const entries: CacheEntry[] = [];
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (!response) continue;
    entries.push({
      key: new URL(request.url).pathname,
      bytes: Number(response.headers.get("x-jim-bytes")) || 0,
      lastUsed: Number(response.headers.get("x-jim-last-used")) || 0,
    });
  }
  await Promise.all(
    planEviction(entries, ORIGINALS_CACHE_MAX_BYTES).map((key) => cache.delete(key)),
  );
}

/** Drops a deleted photo's cached original. */
export async function forgetOriginal(photoId: string): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    await (await caches.open(ORIGINALS_CACHE)).delete(originalKey(photoId));
  } catch {
    // Nothing cached is the same outcome.
  }
}

/**
 * Downloads up to a few thumbnails this phone doesn't have yet (a new phone,
 * or photos from another device), so the grid works offline. Called after a
 * pull; skips photos not uploaded yet, which have nothing to download.
 */
export async function cacheMissingThumbs(
  database: JimDatabase = db,
  storage?: PhotoStorage,
): Promise<number> {
  const photos = (await database.progressPhotos.toArray()).filter(
    (photo) => !photo.deletedAt && photo.uploadedAt,
  );
  if (photos.length === 0) return 0;
  const have = new Set(await database.photoThumbs.toCollection().primaryKeys());
  const missing = photos.filter((photo) => !have.has(photo.id)).slice(0, THUMB_PREFETCH_PER_CYCLE);
  let cached = 0;
  let failures = 0;
  for (const photo of missing) {
    try {
      await getThumbBlob(photo, database, storage);
      cached++;
    } catch {
      // Offline or signed out: a few misses and this cycle gives up.
      if (++failures >= 3) break;
    }
  }
  return cached;
}
