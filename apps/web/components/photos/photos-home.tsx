"use client";

import { Check } from "@/components/icons/solar";
import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { AddPhotoSheet } from "@/components/photos/add-photo-sheet";
import { PhotoCompare } from "@/components/photos/photo-compare";
import { PhotoViewer } from "@/components/photos/photo-viewer";
import type { ProgressPhotoRow } from "@/lib/db/schema";
import { type ProcessedPhoto, processPhotoFile } from "@/lib/photos/image";
import { type PhotoUploadState, useProgressPhotos, useUploadStates } from "@/lib/photos/use-photos";
import { usePhotoUrl } from "@/lib/photos/use-photos";
import {
  COMPARE_MAX_PHOTOS,
  COMPARE_MIN_PHOTOS,
  PHOTO_POSES,
  PHOTO_POSE_LABELS,
  type PhotoPose,
  formatDayKey,
  groupPhotosByMonth,
} from "@jim/core";
import { useCallback, useMemo, useRef, useState } from "react";

type PoseFilter = PhotoPose | "all";

function monthLabel(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function tileLabel(photo: ProgressPhotoRow, state?: PhotoUploadState): string {
  const parts = [
    photo.pose ? PHOTO_POSE_LABELS[photo.pose as PhotoPose] : "Photo",
    formatDayKey(photo.takenOn),
  ];
  if (state === "pending") parts.push("uploading");
  if (state === "failed") parts.push("upload failed");
  return parts.join(", ");
}

function PhotoTile({
  photo,
  state,
  selected,
  selecting,
  onOpen,
}: {
  photo: ProgressPhotoRow;
  state?: PhotoUploadState;
  selected: boolean;
  selecting: boolean;
  onOpen: (photo: ProgressPhotoRow, rect: DOMRect) => void;
}) {
  const { url } = usePhotoUrl(photo, "thumb");
  return (
    // The badges hang off a wrapper beside the button: buttons clip their
    // overflow for the tap ripple (docs/PWA.md §7).
    <li className="relative aspect-[3/4] min-w-0">
      <button
        type="button"
        onClick={(event) => onOpen(photo, event.currentTarget.getBoundingClientRect())}
        aria-label={tileLabel(photo, state)}
        aria-pressed={selecting ? selected : undefined}
        className="press h-full w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900"
      >
        {url && (
          <img
            src={url}
            alt=""
            draggable={false}
            loading="lazy"
            className={`h-full w-full object-cover ${selected ? "opacity-60" : ""}`}
          />
        )}
      </button>
      {photo.pose && (
        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">
          {PHOTO_POSE_LABELS[photo.pose as PhotoPose]}
        </span>
      )}
      {state && (
        <span
          className={`pointer-events-none absolute top-1 left-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
            state === "failed" ? "bg-red-600 text-white" : "bg-black/55 text-white"
          }`}
        >
          {state === "failed" ? "Failed" : "Pending"}
        </span>
      )}
      {selecting && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
            selected
              ? "border-accent bg-accent text-accent-foreground"
              : "border-white bg-black/30 text-transparent"
          }`}
        >
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </span>
      )}
    </li>
  );
}

const ACTION =
  "press flex min-h-11 flex-1 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium disabled:opacity-50 dark:border-zinc-700";

/**
 * Profile → Body → Photos (issue #835): the progress photo grid, by month,
 * with a pose filter, adding from the camera or library, a full-screen viewer
 * and Compare. Reads Dexie, so it works offline; new photos show at once and
 * upload when there's a connection.
 */
export function PhotosHome({ userId }: { userId: string }) {
  const photos = useProgressPhotos();
  const uploads = useUploadStates();
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  const [filter, setFilter] = useState<PoseFilter>("all");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<ProcessedPhoto | null>(null);
  const [viewing, setViewing] = useState<{ photo: ProgressPhotoRow; rect: DOMRect } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState<string[] | null>(null);

  const visible = useMemo(
    () => (photos ?? []).filter((photo) => filter === "all" || photo.pose === filter),
    [photos, filter],
  );
  const months = useMemo(() => groupPhotosByMonth(visible), [visible]);
  // The photo behind the viewer, so edits show live; null once it's deleted.
  const viewed = viewing ? (photos ?? []).find((photo) => photo.id === viewing.photo.id) : null;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      setAdding(await processPhotoFile(file));
    } catch {
      setError("Couldn't read that photo. Try another.");
    } finally {
      setProcessing(false);
    }
  }

  function openTile(photo: ProgressPhotoRow, rect: DOMRect) {
    if (!selecting) {
      setViewing({ photo, rect });
      return;
    }
    setSelected((current) =>
      current.includes(photo.id)
        ? current.filter((id) => id !== photo.id)
        : current.length >= COMPARE_MAX_PHOTOS
          ? current
          : [...current, photo.id],
    );
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected([]);
  }

  const closeViewer = useCallback(() => setViewing(null), []);
  const closeAdd = useCallback(() => setAdding(null), []);
  const closeCompare = useCallback(() => setComparing(null), []);

  const canCompare = selected.length >= COMPARE_MIN_PHOTOS;
  const hasPhotos = (photos?.length ?? 0) > 0;

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title="Photos"
        back={{ href: "/profile", label: "Profile" }}
        actions={
          selecting ? (
            <button
              type="button"
              disabled={!canCompare}
              onClick={() => setComparing(selected)}
              className="press flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-40"
            >
              Compare {selected.length}
            </button>
          ) : (
            hasPhotos && (
              <button
                type="button"
                onClick={() => setSelecting(true)}
                className="press flex min-h-11 items-center rounded-full px-3 text-sm font-semibold"
              >
                Select
              </button>
            )
          )
        }
      />
      <div className={PAGE_BODY}>
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <input
          ref={libraryInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        {selecting ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
              {selected.length} of {COMPARE_MAX_PHOTOS}
            </span>
            <button type="button" onClick={stopSelecting} className={`${ACTION} flex-none`}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={processing}
              onClick={() => cameraInput.current?.click()}
              className={ACTION}
            >
              {processing ? "Processing…" : "Take photo"}
            </button>
            <button
              type="button"
              disabled={processing}
              onClick={() => libraryInput.current?.click()}
              className={ACTION}
            >
              From library
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="allow-pwa-select text-sm text-red-600 dark:text-red-500">
            {error}
          </p>
        )}

        {hasPhotos && (
          <fieldset className="flex min-w-0 gap-2 overflow-x-auto" aria-label="Pose filter">
            {(["all", ...PHOTO_POSES] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
                className={`min-h-11 min-w-11 shrink-0 rounded-full border px-4 text-sm font-medium ${
                  filter === option
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                {option === "all" ? "All" : PHOTO_POSE_LABELS[option]}
              </button>
            ))}
          </fieldset>
        )}

        {photos && !hasPhotos && (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No photos yet.</p>
        )}
        {hasPhotos && visible.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No photos for this pose.</p>
        )}

        {months.map((group) => (
          <section key={group.month} className="flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.03em] text-zinc-500 dark:text-zinc-500">
              {monthLabel(group.month)}
            </h2>
            <ul className="grid grid-cols-3 gap-1.5">
              {group.photos.map((photo) => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  state={uploads.get(photo.id)}
                  selected={selected.includes(photo.id)}
                  selecting={selecting}
                  onOpen={openTile}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {adding && <AddPhotoSheet userId={userId} photo={adding} onClose={closeAdd} />}
      {viewing && viewed && (
        <PhotoViewer
          photo={viewed}
          originRect={viewing.rect}
          uploadState={uploads.get(viewed.id)}
          onClose={closeViewer}
        />
      )}
      {comparing && (
        <PhotoCompare photos={photos ?? []} selectedIds={comparing} onClose={closeCompare} />
      )}
    </main>
  );
}
