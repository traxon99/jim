import { type MeasurementUnit, convertMeasurement } from "../body/measurements";
import type { WeightUnit } from "../data-transfer/workout-csv";
import { dayKey } from "../injuries/days";

/**
 * Progress photos (issue #835): private photos of the user's own body, kept
 * next to their bodyweight. The metadata is a synced `progress_photos` row;
 * the image bytes live in the private `progress-photos` Storage bucket and
 * are never visible to anyone but their owner.
 */

export const PHOTO_POSES = ["front", "side", "back", "other"] as const;
export type PhotoPose = (typeof PHOTO_POSES)[number];

export const PHOTO_POSE_LABELS: Record<PhotoPose, string> = {
  front: "Front",
  side: "Side",
  back: "Back",
  other: "Other",
};

export function isPhotoPose(value: unknown): value is PhotoPose {
  return typeof value === "string" && (PHOTO_POSES as readonly string[]).includes(value);
}

export const PHOTO_NOTE_MAX = 200;
/** The private Supabase Storage bucket holding every progress photo's bytes. */
export const PROGRESS_PHOTO_BUCKET = "progress-photos";
/** Long edge, in pixels, of the stored original and of the grid thumbnail. */
export const PHOTO_ORIGINAL_LONG_EDGE = 2048;
export const PHOTO_THUMB_LONG_EDGE = 400;
export const PHOTO_JPEG_QUALITY = 0.85;

/** How many photos Compare puts side by side. */
export const COMPARE_MIN_PHOTOS = 2;
export const COMPARE_MAX_PHOTOS = 4;
/** A photo takes the latest weigh-in on its day or up to this many days before. */
export const BODYWEIGHT_MATCH_DAYS = 7;

/**
 * Where a photo's two objects live: `<user_id>/<photo_id>/thumb.jpg` and
 * `…/original.jpg`. The first segment must be the owner's id; the bucket's
 * policies check it against `auth.uid()`.
 */
export function photoObjectPaths(
  userId: string,
  photoId: string,
): { thumbPath: string; originalPath: string } {
  return {
    thumbPath: `${userId}/${photoId}/thumb.jpg`,
    originalPath: `${userId}/${photoId}/original.jpg`,
  };
}

/** The subset of a synced photo row these helpers read; Dexie and Drizzle rows both fit. */
export interface PhotoSource {
  id: string;
  /** The local calendar day, YYYY-MM-DD. */
  takenOn: string;
  takenAt: Date;
  pose: string | null;
  deletedAt: Date | null;
}

/** The subset of a `body_measurements` row Compare reads. */
export interface PhotoBodyMeasurementSource {
  kind: string;
  value: string;
  unit: MeasurementUnit;
  measuredAt: Date;
  deletedAt: Date | null;
}

/** Live photos, newest first: the grid's order. */
export function livePhotosNewestFirst<T extends PhotoSource>(photos: readonly T[]): T[] {
  return photos.filter((photo) => !photo.deletedAt).sort(compareNewestFirst);
}

function compareOldestFirst(a: PhotoSource, b: PhotoSource): number {
  return (
    a.takenOn.localeCompare(b.takenOn) ||
    a.takenAt.getTime() - b.takenAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

function compareNewestFirst(a: PhotoSource, b: PhotoSource): number {
  return compareOldestFirst(b, a);
}

/** Photos grouped by month (YYYY-MM), newest month first, each month's photos newest first. */
export function groupPhotosByMonth<T extends PhotoSource>(
  photos: readonly T[],
): { month: string; photos: T[] }[] {
  const groups: { month: string; photos: T[] }[] = [];
  for (const photo of livePhotosNewestFirst(photos)) {
    const month = photo.takenOn.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.photos.push(photo);
    else groups.push({ month, photos: [photo] });
  }
  return groups;
}

export function addDaysToDayKey(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetweenDayKeys(from: string, to: string): number {
  const ms = new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * The bodyweight that goes with a photo: the latest live weigh-in on
 * `takenOn` or in the `BODYWEIGHT_MATCH_DAYS` days before it, in `units`.
 * Null when there is none (a weigh-in after the photo never counts).
 */
export function bodyweightForPhoto(
  takenOn: string,
  bodyMeasurements: readonly PhotoBodyMeasurementSource[],
  units: WeightUnit,
  timeZone?: string,
): number | null {
  const earliest = addDaysToDayKey(takenOn, -BODYWEIGHT_MATCH_DAYS);
  let best: { at: number; value: number } | null = null;
  for (const row of bodyMeasurements) {
    if (row.kind !== "bodyweight" || row.deletedAt) continue;
    const day = dayKey(row.measuredAt, timeZone);
    if (day > takenOn || day < earliest) continue;
    const value = convertMeasurement(Number(row.value), row.unit, units);
    if (value == null || !Number.isFinite(value)) continue;
    const at = row.measuredAt.getTime();
    if (!best || at > best.at) best = { at, value };
  }
  return best ? best.value : null;
}

export interface CompareItem<T extends PhotoSource = PhotoSource> {
  photo: T;
  /** YYYY-MM-DD. */
  date: string;
  /** In the requested units, or null when no weigh-in is close enough. */
  bodyweight: number | null;
  /** Ids of the live photos sharing this one's pose, oldest first: what the slider steps through. */
  sequenceIds: string[];
  /** This photo's place in `sequenceIds`. */
  sequenceIndex: number;
}

export type PhotoCompareResult<T extends PhotoSource = PhotoSource> =
  | { ok: false; reason: "too-few" | "too-many" | "missing" }
  | {
      ok: true;
      /** In the order the ids were given. */
      items: CompareItem<T>[];
      /** Days from the earliest to the latest photo. */
      elapsedDays: number;
      /** Bodyweight at the latest photo minus the earliest, or null if either has none. */
      bodyweightChange: number | null;
      units: WeightUnit;
    };

/**
 * The Compare model for the chosen photos (`selectedIds`, two to four):
 * each one's date and bodyweight, the time and bodyweight change from the
 * earliest to the latest, and for each the photos the slider can swap it
 * for. `photos` is the whole library; tombstoned photos never appear.
 */
export function photoCompare<T extends PhotoSource>(input: {
  photos: readonly T[];
  bodyMeasurements: readonly PhotoBodyMeasurementSource[];
  units: WeightUnit;
  selectedIds: readonly string[];
  timeZone?: string;
}): PhotoCompareResult<T> {
  const { photos, bodyMeasurements, units, selectedIds, timeZone } = input;
  if (selectedIds.length < COMPARE_MIN_PHOTOS) return { ok: false, reason: "too-few" };
  if (selectedIds.length > COMPARE_MAX_PHOTOS) return { ok: false, reason: "too-many" };

  const live = photos.filter((photo) => !photo.deletedAt);
  const byId = new Map(live.map((photo) => [photo.id, photo]));
  const chosen: T[] = [];
  for (const id of selectedIds) {
    const photo = byId.get(id);
    if (!photo) return { ok: false, reason: "missing" };
    chosen.push(photo);
  }

  const items: CompareItem<T>[] = chosen.map((photo) => {
    const sequence = live
      .filter((other) => (other.pose ?? null) === (photo.pose ?? null))
      .sort(compareOldestFirst);
    return {
      photo,
      date: photo.takenOn,
      bodyweight: bodyweightForPhoto(photo.takenOn, bodyMeasurements, units, timeZone),
      sequenceIds: sequence.map((other) => other.id),
      sequenceIndex: sequence.findIndex((other) => other.id === photo.id),
    };
  });

  const chronological = [...items].sort((a, b) => compareOldestFirst(a.photo, b.photo));
  const first = chronological[0];
  const last = chronological[chronological.length - 1];
  if (!first || !last) return { ok: false, reason: "too-few" };
  const bodyweightChange =
    first.bodyweight == null || last.bodyweight == null
      ? null
      : Math.round((last.bodyweight - first.bodyweight) * 100) / 100;

  return {
    ok: true,
    items,
    elapsedDays: daysBetweenDayKeys(first.date, last.date),
    bodyweightChange,
    units,
  };
}

/** Clamps free text to a photo note: trimmed, empty becomes null, capped at `PHOTO_NOTE_MAX`. */
export function cleanPhotoNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, PHOTO_NOTE_MAX);
}
