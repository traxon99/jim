"use client";

import { Trash2 } from "@/components/icons/solar";
import { PhotoOverlay } from "@/components/photos/photo-overlay";
import { db } from "@/lib/db/schema";
import type { ProgressPhotoRow } from "@/lib/db/schema";
import { deleteProgressPhoto, updateProgressPhoto } from "@/lib/photos";
import { type PhotoUploadState, usePhotoUrl } from "@/lib/photos/use-photos";
import {
  FIT,
  type Point,
  type Transform,
  clampScale,
  clampTransform,
  doubleTap,
  pinch,
} from "@/lib/photos/zoom";
import { runSyncCycle } from "@/lib/sync/engine";
import {
  PHOTO_NOTE_MAX,
  PHOTO_POSES,
  PHOTO_POSE_LABELS,
  type PhotoPose,
  formatDayKey,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const TAP_MS = 300;
const TAP_SLOP = 10;

/**
 * The frame's size, kept current. A callback ref, because the overlay renders
 * its children only after it has mounted into <body>, so a plain ref is still
 * empty when the first effect runs.
 */
function useFrameSize() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { ref: setElement, element, size };
}

/**
 * The full-screen photo (issue #835): the picture opens out of its grid tile,
 * pinch or double tap zooms and one finger pans once zoomed. While a finger is
 * down the picture follows it with no transition (docs/ANIMATION.md rule 14);
 * letting go eases it back inside its bounds.
 */
export function PhotoViewer({
  photo,
  originRect,
  uploadState,
  onClose,
}: {
  photo: ProgressPhotoRow;
  /** The grid tile it opened from, for the shared-element open. */
  originRect: DOMRect | null;
  uploadState?: PhotoUploadState;
  onClose: () => void;
}) {
  const { url, failed } = usePhotoUrl(photo, "original");
  const { ref: frameRef, element: frameElement, size: frame } = useFrameSize();

  const fitScale =
    frame.width > 0 ? Math.min(frame.width / photo.width, frame.height / photo.height) : 0;
  const image = { width: photo.width * fitScale, height: photo.height * fitScale };

  const [transform, setTransform] = useState<Transform>(FIT);
  const [settling, setSettling] = useState(false);
  const pointers = useRef(new Map<number, Point>());
  const start = useRef<{ transform: Transform; fingers?: [Point, Point]; pan?: Point }>({
    transform: FIT,
  });
  const lastTap = useRef<{ at: number; point: Point } | null>(null);
  const downAt = useRef<{ at: number; point: Point } | null>(null);

  const centered = (event: { clientX: number; clientY: number }): Point => {
    const rect = frameElement?.getBoundingClientRect();
    return {
      x: event.clientX - (rect ? rect.left + rect.width / 2 : 0),
      y: event.clientY - (rect ? rect.top + rect.height / 2 : 0),
    };
  };
  const fingers = (): [Point, Point] | null => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? [a, b] : null;
  };
  const apply = (next: Transform) => setTransform(clampTransform(next, frame, image));

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, centered(event));
    setSettling(false);
    const pair = fingers();
    start.current = pair ? { transform, fingers: pair } : { transform, pan: centered(event) };
    if (pointers.current.size === 1) downAt.current = { at: Date.now(), point: centered(event) };
    else downAt.current = null;
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, centered(event));
    const pair = fingers();
    if (pair && start.current.fingers) {
      apply(pinch(start.current.transform, start.current.fingers, pair));
    } else if (start.current.pan && start.current.transform.scale > 1) {
      const point = centered(event);
      apply({
        scale: start.current.transform.scale,
        x: start.current.transform.x + point.x - start.current.pan.x,
        y: start.current.transform.y + point.y - start.current.pan.y,
      });
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const point = centered(event);
    pointers.current.delete(event.pointerId);
    setSettling(true);

    const down = downAt.current;
    downAt.current = null;
    if (
      down &&
      event.type === "pointerup" &&
      Date.now() - down.at < TAP_MS &&
      Math.hypot(point.x - down.point.x, point.y - down.point.y) < TAP_SLOP
    ) {
      const previous = lastTap.current;
      if (
        previous &&
        down.at - previous.at < TAP_MS * 1.5 &&
        Math.hypot(point.x - previous.point.x, point.y - previous.point.y) < TAP_SLOP * 4
      ) {
        lastTap.current = null;
        apply(doubleTap(transform, point));
        return;
      }
      lastTap.current = { at: down.at, point };
    }

    if (pointers.current.size === 0) {
      if (transform.scale < 1.02) setTransform(FIT);
    } else {
      // One finger left after a pinch: carry on as a pan from where it is.
      const [remaining] = [...pointers.current.values()];
      start.current = { transform, pan: remaining };
    }
  }

  // A trackpad pinch or ctrl+wheel zooms on desktop.
  useEffect(() => {
    const element = frameElement;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setSettling(false);
      setTransform((current) =>
        clampTransform(
          { ...current, scale: clampScale(current.scale * Math.exp(-event.deltaY / 300)) },
          frame,
          image,
        ),
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  });

  // Shared-element open: the picture grows from its grid tile to its place.
  const pictureRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  useLayoutEffect(() => {
    const picture = pictureRef.current;
    if (opened.current || !picture || !originRect || fitScale === 0) return;
    opened.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = picture.getBoundingClientRect();
    if (to.width === 0 || to.height === 0) return;
    picture.animate(
      [
        {
          transform: `translate(${originRect.left + originRect.width / 2 - (to.left + to.width / 2)}px, ${
            originRect.top + originRect.height / 2 - (to.top + to.height / 2)
          }px) scale(${originRect.width / to.width}, ${originRect.height / to.height})`,
        },
        { transform: "none" },
      ],
      { duration: 240, easing: "ease-in-out" },
    );
  }, [originRect, fitScale]);

  const sessionName = useLiveQuery(
    async () => (photo.sessionId ? (await db.sessions.get(photo.sessionId))?.name : null),
    [photo.sessionId],
  );
  const [note, setNote] = useState(photo.note ?? "");
  // Reseed only when the stored note changes underneath, not while typing.
  const storedNote = photo.note ?? "";
  const lastStored = useRef(storedNote);
  useEffect(() => {
    if (lastStored.current !== storedNote) {
      lastStored.current = storedNote;
      setNote(storedNote);
    }
  }, [storedNote]);
  const [error, setError] = useState<string | null>(null);

  async function save(edit: Parameters<typeof updateProgressPhoto>[1]) {
    setError(null);
    try {
      await updateProgressPhoto(photo, edit);
      void runSyncCycle();
    } catch {
      setError("Couldn't save that. Try again.");
    }
  }

  const deleting = useRef(false);
  async function remove() {
    if (deleting.current) return;
    if (!window.confirm("Delete this photo? This can't be undone.")) return;
    deleting.current = true;
    try {
      await deleteProgressPhoto(photo);
      void runSyncCycle();
      onClose();
    } catch {
      deleting.current = false;
      setError("Couldn't delete that photo. Try again.");
    }
  }

  const title = formatDayKey(photo.takenOn);
  return (
    <PhotoOverlay
      title={title}
      onClose={onClose}
      headerRight={
        <button
          type="button"
          onClick={() => void remove()}
          aria-label="Delete photo"
          className="press flex min-h-11 min-w-11 items-center justify-center rounded-full text-red-600 dark:text-red-500"
        >
          <Trash2 className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      }
    >
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-zinc-100 dark:bg-zinc-900"
      >
        {fitScale > 0 && (
          <div
            ref={pictureRef}
            className="absolute"
            style={{
              width: image.width,
              height: image.height,
              left: (frame.width - image.width) / 2,
              top: (frame.height - image.height) / 2,
            }}
          >
            {url ? (
              <img
                src={url}
                alt={`${title}${photo.pose ? `, ${PHOTO_POSE_LABELS[photo.pose as PhotoPose]}` : ""}`}
                draggable={false}
                className="h-full w-full select-none"
                style={{
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                  transition: settling ? "transform 200ms ease-in-out" : "none",
                  willChange: "transform",
                }}
              />
            ) : (
              <div className="h-full w-full" />
            )}
          </div>
        )}
        {failed && (
          <p
            role="alert"
            className="allow-pwa-select absolute inset-x-0 top-1/2 px-4 text-center text-sm text-red-600 dark:text-red-500"
          >
            Couldn't load this photo.
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-3 px-4 pt-3">
        <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-400">
            {sessionName ?? (photo.sessionId ? "Workout" : "")}
          </span>
          {uploadState && (
            <span
              className={`shrink-0 text-xs ${uploadState === "failed" ? "text-red-600 dark:text-red-500" : "text-zinc-500 dark:text-zinc-500"}`}
            >
              {uploadState === "failed" ? "Upload failed" : "Uploading"}
            </span>
          )}
        </div>
        <fieldset className="flex gap-2 overflow-x-auto" aria-label="Pose">
          {PHOTO_POSES.map((pose) => (
            <button
              key={pose}
              type="button"
              aria-pressed={photo.pose === pose}
              onClick={() => void save({ pose: photo.pose === pose ? null : pose })}
              className={`min-h-11 min-w-11 shrink-0 rounded-full border px-4 text-sm font-medium ${
                photo.pose === pose
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              }`}
            >
              {PHOTO_POSE_LABELS[pose]}
            </button>
          ))}
        </fieldset>
        <input
          type="text"
          value={note}
          maxLength={PHOTO_NOTE_MAX}
          aria-label="Note"
          placeholder="Note"
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            if (note.trim() !== storedNote) void save({ note });
          }}
          className="w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        {error && (
          <p role="alert" className="allow-pwa-select text-sm text-red-600 dark:text-red-500">
            {error}
          </p>
        )}
      </div>
    </PhotoOverlay>
  );
}
