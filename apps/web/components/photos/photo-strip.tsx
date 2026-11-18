"use client";

import type { ProgressPhotoRow } from "@/lib/db/schema";
import { usePhotoUrl, useProgressPhotos } from "@/lib/photos/use-photos";
import { PHOTO_POSE_LABELS, type PhotoPose, formatDayKey } from "@jim/core";
import Link from "next/link";

const PREVIEW_COUNT = 4;

function Thumb({ photo }: { photo: ProgressPhotoRow }) {
  const { url } = usePhotoUrl(photo, "thumb");
  return (
    <li className="aspect-[3/4] min-w-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
      {url && (
        <img
          src={url}
          alt={`${photo.pose ? PHOTO_POSE_LABELS[photo.pose as PhotoPose] : "Photo"}, ${formatDayKey(photo.takenOn)}`}
          draggable={false}
          className="h-full w-full object-cover"
        />
      )}
    </li>
  );
}

/** The latest few progress photos on Profile → Body (issue #835); the grid is one tap away. */
export function PhotoStrip() {
  const photos = useProgressPhotos();
  if (!photos) return null;
  if (photos.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-500">No photos yet.</p>;
  }
  return (
    <Link href="/profile/photos" aria-label="Open progress photos" data-ripple className="block">
      <ul className="grid grid-cols-4 gap-1.5">
        {photos.slice(0, PREVIEW_COUNT).map((photo) => (
          <Thumb key={photo.id} photo={photo} />
        ))}
      </ul>
    </Link>
  );
}
