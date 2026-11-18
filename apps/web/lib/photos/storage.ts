import { createClient } from "@/lib/supabase/client";
import { PROGRESS_PHOTO_BUCKET } from "@jim/core";

/** What the photo code needs from Supabase Storage, so tests can swap in a fake. */
export interface PhotoStorage {
  upload(path: string, blob: Blob): Promise<{ error: { message: string } | null }>;
  /** A short-lived URL for one object; the bucket is private, so every read goes through one. */
  signedUrl(path: string): Promise<string | null>;
}

/** Signed URLs live long enough to start one download, not to be shared. */
export const SIGNED_URL_SECONDS = 120;

/** The signed-in user's Storage, over the bucket's RLS policies. */
export function supabasePhotoStorage(): PhotoStorage {
  const bucket = () => createClient().storage.from(PROGRESS_PHOTO_BUCKET);
  return {
    upload: async (path, blob) => {
      const { error } = await bucket().upload(path, blob, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "3600",
      });
      return { error };
    },
    signedUrl: async (path) => {
      const { data, error } = await bucket().createSignedUrl(path, SIGNED_URL_SECONDS);
      return error ? null : data.signedUrl;
    },
  };
}

/**
 * An upload that finds the object already there (an earlier attempt landed but
 * its answer was lost) has succeeded; storing it again would double-upload.
 */
export function isAlreadyStored(error: { message: string }): boolean {
  return /already exists|duplicate|resource already/i.test(error.message);
}
