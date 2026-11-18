import { mutate } from "@/lib/db/mutate";
import { type JimDatabase, type ProgressPhotoRow, type SessionRow, db } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type PhotoPose,
  cleanPhotoNote,
  dayKey,
  isDayKey,
  isPhotoPose,
  photoObjectPaths,
  uuidv7,
} from "@jim/core";
import { forgetOriginal } from "./cache";
import type { ProcessedPhoto } from "./image";

/**
 * Progress photos (issue #835). The metadata is a synced `progress_photos`
 * row written through the outbox like any other; the bytes wait in the
 * device-local `photoUploads` queue until `drainPhotoUploads` sends them. The
 * thumbnail is cached at once, so the grid shows the photo before it uploads.
 */

export interface SavePhotoInput {
  userId: string;
  photo: Pick<ProcessedPhoto, "original" | "thumb" | "width" | "height" | "capturedAt">;
  /** The local day, YYYY-MM-DD. */
  takenOn: string;
  pose?: PhotoPose | null;
  note?: string | null;
  sessionId?: string | null;
  bodyMeasurementId?: string | null;
}

/** The day to pre-fill: the capture date when the file carries one, else today. */
export function defaultTakenOn(capturedAt: Date | null, now: Date = new Date()): string {
  return dayKey(capturedAt ?? now);
}

/** When a photo was taken: its capture time if that is the chosen day, else the chosen day's noon. */
function takenAtFor(takenOn: string, capturedAt: Date | null, now: Date): Date {
  if (capturedAt && dayKey(capturedAt) === takenOn) return capturedAt;
  if (dayKey(now) === takenOn) return now;
  const [y, m, d] = takenOn.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12);
}

export async function saveProgressPhoto(
  input: SavePhotoInput,
  database: JimDatabase = db,
): Promise<ProgressPhotoRow> {
  if (!isDayKey(input.takenOn)) throw new Error("Pick a date");
  const now = new Date();
  const id = uuidv7();
  const { thumbPath, originalPath } = photoObjectPaths(input.userId, id);
  const row: ProgressPhotoRow = {
    id,
    userId: input.userId,
    takenOn: input.takenOn,
    takenAt: takenAtFor(input.takenOn, input.photo.capturedAt, now),
    pose: input.pose ?? null,
    note: cleanPhotoNote(input.note),
    sessionId: input.sessionId ?? null,
    bodyMeasurementId: input.bodyMeasurementId ?? null,
    width: input.photo.width,
    height: input.photo.height,
    thumbPath,
    originalPath,
    uploadedAt: null,
    updatedAt: now,
    deviceId: await getDeviceId(database),
    deletedAt: null,
    serverSeq: 0,
  };
  await database.transaction(
    "rw",
    [database.progressPhotos, database.outbox, database.photoUploads, database.photoThumbs],
    async () => {
      await database.photoUploads.put({
        photoId: id,
        thumb: input.photo.thumb,
        original: input.photo.original,
        thumbDone: false,
        originalDone: false,
        failures: 0,
        createdAt: now,
      });
      await database.photoThumbs.put({ id, blob: input.photo.thumb, cachedAt: now });
      await mutate("progressPhotos", row, database);
    },
  );
  return row;
}

export interface PhotoEdit {
  takenOn?: string;
  pose?: PhotoPose | null;
  note?: string | null;
  sessionId?: string | null;
  bodyMeasurementId?: string | null;
}

/** Edits a photo's date, pose, note or links. Only the fields given change. */
export async function updateProgressPhoto(
  row: ProgressPhotoRow,
  edit: PhotoEdit,
  database: JimDatabase = db,
): Promise<ProgressPhotoRow> {
  const now = new Date();
  const takenOn = edit.takenOn ?? row.takenOn;
  if (!isDayKey(takenOn)) throw new Error("Pick a date");
  const pose = edit.pose === undefined ? row.pose : edit.pose;
  if (pose != null && !isPhotoPose(pose)) throw new Error("Unknown pose");
  const next: ProgressPhotoRow = {
    ...row,
    takenOn,
    takenAt: takenOn === row.takenOn ? row.takenAt : takenAtFor(takenOn, null, now),
    pose,
    note: edit.note === undefined ? row.note : cleanPhotoNote(edit.note),
    sessionId: edit.sessionId === undefined ? row.sessionId : edit.sessionId,
    bodyMeasurementId:
      edit.bodyMeasurementId === undefined ? row.bodyMeasurementId : edit.bodyMeasurementId,
    updatedAt: now,
    deviceId: await getDeviceId(database),
  };
  await mutate("progressPhotos", next, database);
  return next;
}

/**
 * Deletes a photo: tombstones the row (the push route then removes both
 * Storage objects), and drops its queued bytes and cached copies here. The
 * bytes can't be brought back, so callers ask first.
 */
export async function deleteProgressPhoto(
  row: ProgressPhotoRow,
  database: JimDatabase = db,
): Promise<void> {
  const now = new Date();
  const deviceId = await getDeviceId(database);
  await database.transaction(
    "rw",
    [database.progressPhotos, database.outbox, database.photoUploads, database.photoThumbs],
    async () => {
      await mutate(
        "progressPhotos",
        { ...row, deletedAt: now, updatedAt: now, deviceId },
        database,
      );
      await database.photoUploads.delete(row.id);
      await database.photoThumbs.delete(row.id);
    },
  );
  await forgetOriginal(row.id);
}

/** What a photo can be linked to on its day: that day's workouts and weigh-in. */
export interface LinkChoices {
  sessions: { id: string; name: string }[];
  bodyweight: { id: string; value: string; unit: string } | null;
}

export async function linkChoicesFor(
  takenOn: string,
  database: JimDatabase = db,
): Promise<LinkChoices> {
  const [sessions, measurements] = await Promise.all([
    database.sessions.toArray(),
    database.bodyMeasurements.toArray(),
  ]);
  const onDay = (date: Date) => dayKey(date) === takenOn;
  const daySessions = sessions
    .filter((session: SessionRow) => !session.deletedAt && onDay(session.startedAt))
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map((session) => ({ id: session.id, name: session.name?.trim() || "Workout" }));
  const weighIn = measurements
    .filter((row) => row.kind === "bodyweight" && !row.deletedAt && onDay(row.measuredAt))
    .sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime())[0];
  return {
    sessions: daySessions,
    bodyweight: weighIn ? { id: weighIn.id, value: weighIn.value, unit: weighIn.unit } : null,
  };
}
