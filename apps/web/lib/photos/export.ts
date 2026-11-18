import { type JimDatabase, type ProgressPhotoRow, db } from "@/lib/db/schema";
import { PHOTO_POSE_LABELS, type PhotoPose, livePhotosNewestFirst } from "@jim/core";
import { getOriginalBlob } from "./cache";
import type { PhotoStorage } from "./storage";
import { type ZipEntry, buildZip } from "./zip";

/** The photos export needs the network: originals come from Storage with signed URLs. */
export class PhotoExportOfflineError extends Error {
  constructor() {
    super("Exporting photos needs a connection.");
  }
}

/** `2026-03-10-front-1a2b3c4d.jpg`, unique per photo and sorted by date. */
export function photoFileName(photo: Pick<ProgressPhotoRow, "id" | "takenOn" | "pose">): string {
  return `${photo.takenOn}-${photo.pose ?? "photo"}-${photo.id.slice(-8)}.jpg`;
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** The manifest that goes beside the images: file, date, pose and note, oldest first. */
export function photoManifest(photos: readonly ProgressPhotoRow[]): string {
  const rows = livePhotosNewestFirst(photos).reverse();
  const lines = rows.map((photo) =>
    [
      photoFileName(photo),
      photo.takenOn,
      photo.pose ? PHOTO_POSE_LABELS[photo.pose as PhotoPose] : "",
      photo.note ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return `${["file", "date", "pose", "note"].join(",")}\n${lines.join("\n")}${lines.length ? "\n" : ""}`;
}

/**
 * A zip of every live photo's original plus `manifest.csv` (issue #835). The
 * originals are fetched with signed URLs, one at a time so a large library
 * doesn't sit in memory twice; progress is reported per photo.
 */
export async function buildPhotosExport(
  options: {
    database?: JimDatabase;
    storage?: PhotoStorage;
    online?: boolean;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<Blob> {
  const database = options.database ?? db;
  if (!(options.online ?? navigator.onLine)) throw new PhotoExportOfflineError();
  const photos = livePhotosNewestFirst(await database.progressPhotos.toArray()).reverse();
  const entries: ZipEntry[] = [];
  for (const [index, photo] of photos.entries()) {
    const blob = await getOriginalBlob(photo, database, options.storage);
    entries.push({
      name: photoFileName(photo),
      data: new Uint8Array(await blob.arrayBuffer()),
      modified: photo.takenAt,
    });
    options.onProgress?.(index + 1, photos.length);
  }
  entries.push({ name: "manifest.csv", data: new TextEncoder().encode(photoManifest(photos)) });
  return buildZip(entries);
}
