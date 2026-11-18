"use client";

import { PhotoOverlay } from "@/components/photos/photo-overlay";
import { db } from "@/lib/db/schema";
import type { ProgressPhotoRow } from "@/lib/db/schema";
import { usePhotoUrl } from "@/lib/photos/use-photos";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import {
  type CompareItem,
  PHOTO_POSE_LABELS,
  type PhotoPose,
  formatDayKey,
  photoCompare,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";

/** "−5.5 kg" / "+2 lb": a typographic minus, one decimal at most. */
function signedWeight(change: number, units: string): string {
  const sign = change < 0 ? "−" : change > 0 ? "+" : "";
  return `${sign}${Math.abs(change).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units}`;
}

function CompareSlot({
  item,
  units,
  large,
  index,
  onStep,
}: {
  item: CompareItem<ProgressPhotoRow>;
  units: string;
  large: boolean;
  index: number;
  onStep: (photoId: string) => void;
}) {
  // Two across is wide enough to want the full-size photo; three or four use the thumbnail.
  const { url } = usePhotoUrl(item.photo, large ? "original" : "thumb");
  const last = item.sequenceIds.length - 1;
  const pose = item.photo.pose ? PHOTO_POSE_LABELS[item.photo.pose as PhotoPose] : "Untagged";
  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <div className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
        {url && (
          <img
            src={url}
            alt={`${formatDayKey(item.date)}, ${pose}`}
            draggable={false}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-col text-xs leading-tight">
        <span className="truncate font-semibold">{formatDayKey(item.date)}</span>
        <span className="truncate tabular-nums text-zinc-600 dark:text-zinc-400">
          {item.bodyweight == null
            ? "–"
            : `${item.bodyweight.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units}`}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, last)}
        step={1}
        value={Math.max(0, item.sequenceIndex)}
        disabled={last <= 0}
        aria-label={`Photo ${index + 1}: scrub through ${pose.toLowerCase()} photos`}
        aria-valuetext={`${formatDayKey(item.date)}, ${item.sequenceIndex + 1} of ${last + 1}`}
        onChange={(event) => {
          const id = item.sequenceIds[Number(event.target.value)];
          if (id) onStep(id);
        }}
        className="h-11 w-full min-w-0 accent-[var(--accent)] disabled:opacity-40"
      />
    </li>
  );
}

/**
 * Two to four photos side by side (issue #835), each with its date and that
 * day's bodyweight, the time and weight between the first and last, and a
 * slider per photo that steps it through the photos of the same pose.
 */
export function PhotoCompare({
  photos,
  selectedIds,
  onClose,
}: {
  photos: readonly ProgressPhotoRow[];
  selectedIds: readonly string[];
  onClose: () => void;
}) {
  const settings = useLiveQuery(() => db.settings.get("me"), []);
  const units = settings?.units ?? DEFAULT_SETTINGS.units;
  const measurements = useLiveQuery(() => db.bodyMeasurements.toArray(), []);
  const [slots, setSlots] = useState<string[]>([...selectedIds]);

  const model = useMemo(
    () =>
      photoCompare({
        photos,
        bodyMeasurements: measurements ?? [],
        units,
        selectedIds: slots,
      }),
    [photos, measurements, units, slots],
  );

  const items = model.ok ? model.items : [];
  const cols = items.length === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <PhotoOverlay title="Compare" onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4">
        {model.ok ? (
          <>
            <p className="tabular-nums text-sm font-medium" aria-live="polite">
              {model.elapsedDays.toLocaleString()} {model.elapsedDays === 1 ? "day" : "days"}
              {model.bodyweightChange != null &&
                ` · ${signedWeight(model.bodyweightChange, units)}`}
            </p>
            <ul className={`grid ${cols} items-start gap-2`}>
              {items.map((item, index) => (
                <CompareSlot
                  // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional; keying by photo would remount a slider mid-drag.
                  key={index}
                  item={item}
                  units={units}
                  large={items.length <= 2}
                  index={index}
                  onStep={(photoId) =>
                    setSlots((current) => current.map((id, i) => (i === index ? photoId : id)))
                  }
                />
              ))}
            </ul>
          </>
        ) : (
          <p role="alert" className="text-sm text-red-600 dark:text-red-500">
            Pick two to four photos to compare.
          </p>
        )}
      </div>
    </PhotoOverlay>
  );
}
