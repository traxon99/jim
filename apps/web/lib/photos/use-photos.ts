"use client";

import { db } from "@/lib/db/schema";
import type { PhotoUploadRow, ProgressPhotoRow } from "@/lib/db/schema";
import { livePhotosNewestFirst } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { getOriginalBlob, getThumbBlob } from "./cache";
import { MAX_UPLOAD_FAILURES } from "./upload-queue";

/** The user's live progress photos, newest first; undefined while loading. */
export function useProgressPhotos(): ProgressPhotoRow[] | undefined {
  const rows = useLiveQuery(() => db.progressPhotos.toArray(), []);
  return useMemo(() => (rows ? livePhotosNewestFirst(rows) : undefined), [rows]);
}

export type PhotoUploadState = "pending" | "failed";

/** Which photos' bytes haven't reached Storage yet, and whether the attempt failed. */
export function useUploadStates(): ReadonlyMap<string, PhotoUploadState> {
  const uploads = useLiveQuery(() => db.photoUploads.toArray(), []);
  return useMemo(
    () =>
      new Map(
        (uploads ?? []).map((upload: PhotoUploadRow) => [
          upload.photoId,
          upload.failures >= MAX_UPLOAD_FAILURES ? "failed" : "pending",
        ]),
      ),
    [uploads],
  );
}

export type PhotoUrl = { url: string | null; failed: boolean };

/**
 * An object URL for a photo's bytes, revoked when it changes or unmounts. The
 * thumbnail comes from IndexedDB at once; `kind: "original"` shows that
 * thumbnail while the full-size photo loads, then swaps to it.
 */
export function usePhotoUrl(photo: ProgressPhotoRow | undefined, kind: "thumb" | "original") {
  const [state, setState] = useState<PhotoUrl>({ url: null, failed: false });
  const photoId = photo?.id;
  // The row can change (a note edit) without the bytes changing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by id and kind only.
  useEffect(() => {
    if (!photo) return;
    let cancelled = false;
    const urls: string[] = [];
    const show = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      urls.push(url);
      if (!cancelled) setState({ url, failed: false });
    };
    // Keep the previous picture up while the next loads, so scrubbing doesn't flash.
    setState((current) => ({ url: current.url, failed: false }));
    (async () => {
      try {
        if (kind === "original") {
          try {
            show(await getThumbBlob(photo));
          } catch {
            // The original below may still load.
          }
          show(await getOriginalBlob(photo));
        } else {
          show(await getThumbBlob(photo));
        }
      } catch {
        if (!cancelled) setState((current) => ({ url: current.url, failed: current.url === null }));
      }
    })();
    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [photoId, kind]);
  return state;
}
