"use client";

import { localDateInput } from "@/components/bodyweight/measurement-log";
import { FloatingCard } from "@/components/floating-card";
import { type LinkChoices, defaultTakenOn, linkChoicesFor, saveProgressPhoto } from "@/lib/photos";
import type { ProcessedPhoto } from "@/lib/photos/image";
import { runSyncCycle } from "@/lib/sync/engine";
import {
  PHOTO_NOTE_MAX,
  PHOTO_POSES,
  PHOTO_POSE_LABELS,
  type PhotoPose,
  isDayKey,
} from "@jim/core";
import { useEffect, useMemo, useRef, useState } from "react";

const INPUT_CLASS =
  "w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

const chip = (on: boolean) =>
  `min-h-11 min-w-11 max-w-full shrink-0 truncate rounded-full border px-4 text-sm font-medium ${
    on
      ? "border-accent bg-accent text-accent-foreground"
      : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
  }`;

/**
 * The step after picking a photo (issue #835): its date (the photo's capture
 * day when it has one, else today), an optional pose and note, and a link to
 * that day's workout or weigh-in.
 */
export function AddPhotoSheet({
  userId,
  photo,
  onClose,
}: {
  userId: string;
  photo: ProcessedPhoto;
  onClose: () => void;
}) {
  const preview = useMemo(() => URL.createObjectURL(photo.thumb), [photo.thumb]);
  useEffect(() => () => URL.revokeObjectURL(preview), [preview]);

  const [takenOn, setTakenOn] = useState(() => defaultTakenOn(photo.capturedAt));
  const [pose, setPose] = useState<PhotoPose | null>(null);
  const [note, setNote] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bodyMeasurementId, setBodyMeasurementId] = useState<string | null>(null);
  const [choices, setChoices] = useState<LinkChoices>({ sessions: [], bodyweight: null });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveGuard = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setSessionId(null);
    setBodyMeasurementId(null);
    if (!isDayKey(takenOn)) {
      setChoices({ sessions: [], bodyweight: null });
      return;
    }
    void linkChoicesFor(takenOn).then((next) => {
      if (!cancelled) setChoices(next);
    });
    return () => {
      cancelled = true;
    };
  }, [takenOn]);

  async function save(close: () => void) {
    if (saveGuard.current) return;
    if (!isDayKey(takenOn)) {
      setError("Pick a date");
      return;
    }
    saveGuard.current = true;
    setSaving(true);
    setError(null);
    try {
      await saveProgressPhoto({
        userId,
        photo,
        takenOn,
        pose,
        note,
        sessionId,
        bodyMeasurementId,
      });
      void runSyncCycle();
      close();
    } catch {
      saveGuard.current = false;
      setSaving(false);
      setError("Couldn't save that photo. Try again.");
    }
  }

  return (
    <FloatingCard labelledBy="add-photo-title" onClose={onClose}>
      {(close) => (
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
          <h2 id="add-photo-title" className="text-lg font-semibold">
            Add photo
          </h2>
          <div className="flex min-w-0 gap-3">
            <img
              src={preview}
              alt="Preview"
              className="h-32 w-24 shrink-0 rounded-lg object-cover"
            />
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium">
              Date
              <input
                type="date"
                value={takenOn}
                max={localDateInput(new Date())}
                onChange={(event) => setTakenOn(event.target.value)}
                className={INPUT_CLASS}
              />
            </label>
          </div>

          <fieldset className="flex min-w-0 flex-wrap gap-2" aria-label="Pose">
            {PHOTO_POSES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={pose === option}
                onClick={() => setPose(pose === option ? null : option)}
                className={chip(pose === option)}
              >
                {PHOTO_POSE_LABELS[option]}
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
            className={INPUT_CLASS}
          />

          {(choices.sessions.length > 0 || choices.bodyweight) && (
            <fieldset className="flex min-w-0 flex-wrap gap-2" aria-label="Link">
              {choices.sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  aria-pressed={sessionId === session.id}
                  onClick={() => setSessionId(sessionId === session.id ? null : session.id)}
                  className={chip(sessionId === session.id)}
                >
                  {session.name}
                </button>
              ))}
              {choices.bodyweight && (
                <button
                  type="button"
                  aria-pressed={bodyMeasurementId === choices.bodyweight.id}
                  onClick={() =>
                    setBodyMeasurementId(
                      bodyMeasurementId === choices.bodyweight?.id
                        ? null
                        : (choices.bodyweight?.id ?? null),
                    )
                  }
                  className={chip(bodyMeasurementId === choices.bodyweight.id)}
                >
                  Weigh-in {Number(choices.bodyweight.value)} {choices.bodyweight.unit}
                </button>
              )}
            </fieldset>
          )}

          {error && (
            <p role="alert" className="allow-pwa-select text-sm text-red-600 dark:text-red-500">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save(close)}
              disabled={saving}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </FloatingCard>
  );
}
