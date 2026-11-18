import { mutate } from "@/lib/db/mutate";
import { type JimDatabase, db } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import { type PhotoStorage, isAlreadyStored, supabasePhotoStorage } from "./storage";

/** Failed attempts after which a photo reads as a sync error, not pending. */
export const MAX_UPLOAD_FAILURES = 3;

export interface DrainResult {
  /** Photos whose bytes both landed and were marked uploaded this drain. */
  uploaded: number;
  /** Photos still queued afterwards. */
  remaining: number;
  /** Whether an attempt failed, which stops the drain until the next cycle. */
  failed: boolean;
}

async function putObject(
  storage: PhotoStorage,
  path: string,
  blob: Blob,
): Promise<{ message: string } | null> {
  try {
    const { error } = await storage.upload(path, blob);
    return error && !isAlreadyStored(error) ? error : null;
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Upload failed" };
  }
}

/**
 * Sends queued photo bytes to Storage (issue #835), oldest first, on the same
 * foreground triggers as sync (ADR-002). Each object is recorded as done the
 * moment it lands, so a retry after a failure resumes at the object that
 * failed instead of uploading the other again. Only when both are stored does
 * the photo's metadata row get `uploadedAt`, through the outbox like any edit.
 * A failure stops the drain (the next photo would most likely fail the same
 * way) and counts against the photo.
 */
export async function drainPhotoUploads(
  database: JimDatabase = db,
  storage?: PhotoStorage,
): Promise<DrainResult> {
  const queued = await database.photoUploads.orderBy("createdAt").toArray();
  if (queued.length === 0) return { uploaded: 0, remaining: 0, failed: false };

  const client = storage ?? supabasePhotoStorage();
  let uploaded = 0;
  let failed = false;

  for (const upload of queued) {
    const photo = await database.progressPhotos.get(upload.photoId);
    // Deleted (or never saved): the bytes have nowhere to go.
    if (!photo || photo.deletedAt) {
      await database.photoUploads.delete(upload.photoId);
      continue;
    }

    let current = upload;
    const steps = [
      { done: "thumbDone", path: photo.thumbPath, blob: upload.thumb },
      { done: "originalDone", path: photo.originalPath, blob: upload.original },
    ] as const;
    for (const step of steps) {
      if (current[step.done]) continue;
      const error = await putObject(client, step.path, step.blob);
      if (error) {
        failed = true;
        await database.photoUploads.update(upload.photoId, { failures: current.failures + 1 });
        break;
      }
      current = { ...current, [step.done]: true };
      await database.photoUploads.update(upload.photoId, { [step.done]: true });
    }
    if (failed) break;

    const now = new Date();
    if (!photo.uploadedAt) {
      await mutate(
        "progressPhotos",
        { ...photo, uploadedAt: now, updatedAt: now, deviceId: await getDeviceId(database) },
        database,
      );
    }
    await database.photoUploads.delete(upload.photoId);
    uploaded++;
  }

  return { uploaded, remaining: await database.photoUploads.count(), failed };
}
