"use client";

import { useState } from "react";
import { ExerciseDialog } from "./exercise-dialog";

/**
 * The ⋯ menu's sticky note and rest timer dialogs (issue #271), out of the
 * exercise section so it stays about sets (#556). Each owns its draft, so
 * it opens on the saved value every time.
 */

const REST_PRESETS = [0, 30, 60, 90, 120, 180, 300] as const;

export function formatRest(seconds: number): string {
  if (seconds <= 0) return "Off";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function StickyNoteDialog({
  exerciseName,
  note,
  onSave,
  onClose,
}: {
  exerciseName: string;
  note: string | null;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(note ?? "");
  return (
    <ExerciseDialog title="Sticky note" onClose={onClose}>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Shows on {exerciseName} in every workout until you change it.
      </p>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={3}
        // biome-ignore lint/a11y/noAutofocus: the dialog exists to type this note.
        autoFocus
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
      />
      <div className="flex justify-end gap-2">
        {note && (
          <button
            type="button"
            onClick={() => onSave("")}
            className="mr-auto min-h-11 px-2 text-sm font-medium text-red-600 dark:text-red-500"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 px-3 text-sm font-medium text-zinc-600 dark:text-zinc-400"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Save
        </button>
      </div>
    </ExerciseDialog>
  );
}

export function RestDialog({
  exerciseName,
  restSeconds,
  overridden,
  onSave,
  onUseRoutineRest,
  onClose,
}: {
  exerciseName: string;
  /** The rest in effect now. */
  restSeconds: number;
  /** Whether this workout overrides the routine's rest. */
  overridden: boolean;
  onSave: (seconds: number) => void;
  onUseRoutineRest: () => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState("");
  return (
    <ExerciseDialog title="Rest timer" onClose={onClose}>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Rest after each set of {exerciseName} in this workout. Now {formatRest(restSeconds)}.
      </p>
      <div className="grid grid-cols-4 gap-2">
        {REST_PRESETS.map((seconds) => (
          <button
            key={seconds}
            type="button"
            aria-pressed={restSeconds === seconds}
            onClick={() => onSave(seconds)}
            className={`min-h-11 rounded-lg border text-sm font-medium tabular-nums ${
              restSeconds === seconds
                ? "border-accent bg-accent text-accent-foreground"
                : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            {formatRest(seconds)}
          </button>
        ))}
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const seconds = custom.trim() === "" ? Number.NaN : Number(custom);
          if (Number.isFinite(seconds) && seconds >= 0) onSave(seconds);
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium">
          Custom (seconds)
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Set
        </button>
      </form>
      {overridden && (
        <button
          type="button"
          onClick={onUseRoutineRest}
          className="self-start text-sm font-medium text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
        >
          Use the routine's rest
        </button>
      )}
    </ExerciseDialog>
  );
}
