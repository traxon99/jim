import { type JimDatabase, createTestDb } from "@/lib/db/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteProgressPhoto, saveProgressPhoto } from "..";
import type { PhotoStorage } from "../storage";
import { MAX_UPLOAD_FAILURES, drainPhotoUploads } from "../upload-queue";

const USER = "11111111-1111-1111-1111-111111111111";

let database: JimDatabase;

beforeEach(() => {
  database = createTestDb(`jim-photos-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await database.delete();
});

/** A Storage double that records uploads and fails on demand. */
function fakeStorage() {
  const stored = new Map<string, number>();
  const state = { failNext: 0, failPath: null as string | null, calls: [] as string[] };
  const storage: PhotoStorage = {
    async upload(path) {
      state.calls.push(path);
      if (state.failNext > 0 || state.failPath === path) {
        state.failNext = Math.max(0, state.failNext - 1);
        return { error: { message: "Failed to fetch" } };
      }
      if (stored.has(path)) return { error: { message: "The resource already exists" } };
      stored.set(path, (stored.get(path) ?? 0) + 1);
      return { error: null };
    },
    async signedUrl() {
      return null;
    },
  };
  return { storage, stored, state };
}

const photo = () => ({
  original: new Blob(["original"], { type: "image/jpeg" }),
  thumb: new Blob(["thumb"], { type: "image/jpeg" }),
  width: 1536,
  height: 2048,
  capturedAt: null,
});

describe("progress photo upload queue", () => {
  it("saves a photo offline: metadata and thumbnail at once, upload queued", async () => {
    const row = await saveProgressPhoto(
      { userId: USER, photo: photo(), takenOn: "2026-03-10", pose: "front", note: " end of cut " },
      database,
    );
    expect(row).toMatchObject({
      takenOn: "2026-03-10",
      pose: "front",
      note: "end of cut",
      uploadedAt: null,
      thumbPath: `${USER}/${row.id}/thumb.jpg`,
      originalPath: `${USER}/${row.id}/original.jpg`,
    });
    expect(await database.outbox.count()).toBe(1);
    expect(await database.photoUploads.count()).toBe(1);
    expect(await database.photoThumbs.get(row.id)).toBeDefined();
  });

  it("drains online: both objects stored, then uploadedAt set and the queue emptied", async () => {
    const row = await saveProgressPhoto(
      { userId: USER, photo: photo(), takenOn: "2026-03-10" },
      database,
    );
    const { storage, stored } = fakeStorage();

    const result = await drainPhotoUploads(database, storage);

    expect(result).toEqual({ uploaded: 1, remaining: 0, failed: false });
    expect([...stored.keys()].sort()).toEqual([row.originalPath, row.thumbPath].sort());
    expect((await database.progressPhotos.get(row.id))?.uploadedAt).toBeInstanceOf(Date);
    expect(await database.photoUploads.count()).toBe(0);
    // The uploadedAt write is queued to sync, after the row's creation.
    expect(await database.outbox.count()).toBe(2);
  });

  it("leaves uploadedAt unset until both objects are stored", async () => {
    const row = await saveProgressPhoto(
      { userId: USER, photo: photo(), takenOn: "2026-03-10" },
      database,
    );
    const { storage, state } = fakeStorage();
    state.failPath = row.originalPath;

    const result = await drainPhotoUploads(database, storage);

    expect(result.failed).toBe(true);
    expect((await database.progressPhotos.get(row.id))?.uploadedAt).toBeNull();
    expect(await database.photoUploads.count()).toBe(1);
  });

  it("retries after a failure without uploading the stored object twice", async () => {
    const row = await saveProgressPhoto(
      { userId: USER, photo: photo(), takenOn: "2026-03-10" },
      database,
    );
    const { storage, state, stored } = fakeStorage();
    state.failPath = row.originalPath;
    await drainPhotoUploads(database, storage);
    expect(state.calls).toEqual([row.thumbPath, row.originalPath]);

    state.failPath = null;
    const retry = await drainPhotoUploads(database, storage);

    expect(retry.uploaded).toBe(1);
    // The thumbnail was not sent again; only the failed original was retried.
    expect(state.calls).toEqual([row.thumbPath, row.originalPath, row.originalPath]);
    expect(stored.get(row.thumbPath)).toBe(1);
    expect((await database.progressPhotos.get(row.id))?.uploadedAt).toBeInstanceOf(Date);
  });

  it("treats an object that is already stored as uploaded", async () => {
    const row = await saveProgressPhoto(
      { userId: USER, photo: photo(), takenOn: "2026-03-10" },
      database,
    );
    const { storage, stored } = fakeStorage();
    stored.set(row.thumbPath, 1);

    const result = await drainPhotoUploads(database, storage);

    expect(result).toMatchObject({ uploaded: 1, failed: false });
  });

  it("counts failures per photo so a stuck one can show as an error", async () => {
    const row = await saveProgressPhoto(
      { userId: USER, photo: photo(), takenOn: "2026-03-10" },
      database,
    );
    const { storage, state } = fakeStorage();
    state.failNext = 100;

    for (let i = 0; i < MAX_UPLOAD_FAILURES; i++) await drainPhotoUploads(database, storage);

    expect((await database.photoUploads.get(row.id))?.failures).toBe(MAX_UPLOAD_FAILURES);
  });

  it("drops the queued bytes of a photo deleted before it uploaded", async () => {
    const row = await saveProgressPhoto(
      { userId: USER, photo: photo(), takenOn: "2026-03-10" },
      database,
    );
    await deleteProgressPhoto(row, database);
    const { storage, state } = fakeStorage();

    const result = await drainPhotoUploads(database, storage);

    expect(result).toEqual({ uploaded: 0, remaining: 0, failed: false });
    expect(state.calls).toEqual([]);
    expect(await database.photoThumbs.get(row.id)).toBeUndefined();
    // Create, then tombstone: the server removes whatever objects exist.
    expect(await database.outbox.count()).toBe(2);
  });

  it("does nothing, and builds no client, when nothing is queued", async () => {
    await expect(drainPhotoUploads(database)).resolves.toEqual({
      uploaded: 0,
      remaining: 0,
      failed: false,
    });
  });
});
