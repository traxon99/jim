import { createClient } from "@/lib/supabase/client";
import { PROGRESS_PHOTO_BUCKET } from "@jim/core";

/** What the photo code needs from Supabase Storage, so tests can swap in a fake. */
export interface PhotoStorage {
  /**
   * `error.status` is the HTTP status Storage answered with; an error without
   * one never got an answer (no signal, or a timeout), which is offline, not a failure.
   */
  upload(path: string, blob: Blob): Promise<{ error: PhotoStorageError | null }>;
  /** Removes objects, as the owner; used to clean up after a photo deleted mid-upload. */
  remove(paths: string[]): Promise<void>;
  /** A short-lived URL for one object; the bucket is private, so every read goes through one. */
  signedUrl(path: string): Promise<string | null>;
}

export interface PhotoStorageError {
  message: string;
  status?: number;
}

/** How long one photo request may take (docs/LESSONS.md: every sync request has a timeout). */
export const PHOTO_REQUEST_TIMEOUT_MS = 30_000;

/** Rejects after `ms`, so a hung request can't hold the single-flight sync cycle (#684). */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = PHOTO_REQUEST_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Request timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Signed URLs live long enough to start one download, not to be shared. */
export const SIGNED_URL_SECONDS = 120;

/** The signed-in user's Storage, over the bucket's RLS policies. */
export function supabasePhotoStorage(): PhotoStorage {
  const bucket = () => createClient().storage.from(PROGRESS_PHOTO_BUCKET);
  return {
    upload: async (path, blob) => {
      const { error } = await withTimeout(
        bucket().upload(path, blob, {
          contentType: "image/jpeg",
          upsert: false,
          cacheControl: "3600",
        }),
      );
      return { error: error ? { message: error.message, status: errorStatus(error) } : null };
    },
    remove: async (paths) => {
      await withTimeout(bucket().remove(paths));
    },
    signedUrl: async (path) => {
      const { data, error } = await withTimeout(bucket().createSignedUrl(path, SIGNED_URL_SECONDS));
      return error ? null : data.signedUrl;
    },
  };
}

/**
 * An upload that finds the object already there (an earlier attempt landed but
 * its answer was lost) has succeeded; storing it again would double-upload.
 */
export function isAlreadyStored(error: PhotoStorageError): boolean {
  return /already exists|duplicate|resource already/i.test(error.message);
}

/** supabase-js's StorageApiError carries the HTTP status; a network failure has none. */
function errorStatus(error: object): number | undefined {
  const status = (error as { status?: unknown; statusCode?: unknown }).status;
  const code = (error as { statusCode?: unknown }).statusCode;
  const value = Number(status ?? code);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}
