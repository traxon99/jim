"use client";

import type { RoutineExerciseRow as RoutineExerciseRowEntity } from "@/lib/db/schema";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ProgressionMechanic, suggestedWeeklyIncrement } from "@jim/core";
import { Trash2 } from "lucide-react";
import { useState } from "react";

interface Props {
  item: RoutineExerciseRowEntity;
  exerciseName: string;
  exerciseMechanic: ProgressionMechanic;
  /** Warm-ups (issue #59) only take sets plus reps or a hold time. */
  warmup?: { timed: boolean } | null;
  units: "lb" | "kg";
  onUpdate: (patch: Partial<RoutineExerciseRowEntity>) => void;
  onRemove: () => void;
}

function toNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Postgres numeric columns round-trip as fixed-scale strings ("135.00"). */
function formatNumericField(value: string | null): string {
  if (value == null) return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function toNumericStringOrNull(value: string): string | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : null;
}

export function RoutineExerciseRow({
  item,
  exerciseName,
  exerciseMechanic,
  warmup = null,
  units,
  onUpdate,
  onRemove,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const [targetSets, setTargetSets] = useState(item.targetSets?.toString() ?? "");
  const [repsLow, setRepsLow] = useState(item.targetRepsLow?.toString() ?? "");
  const [repsHigh, setRepsHigh] = useState(item.targetRepsHigh?.toString() ?? "");
  const [durationSeconds, setDurationSeconds] = useState(
    item.targetDurationSeconds?.toString() ?? "",
  );
  const [restSeconds, setRestSeconds] = useState(item.targetRestSeconds?.toString() ?? "");
  const [targetWeight, setTargetWeight] = useState(formatNumericField(item.targetWeight));
  const [progressionEnabled, setProgressionEnabled] = useState(item.progressionIncrement != null);
  const [increment, setIncrement] = useState(
    formatNumericField(item.progressionIncrement) ||
      String(suggestedWeeklyIncrement(exerciseMechanic, units)),
  );
  const [notes, setNotes] = useState(item.notes ?? "");

  // Editing the baseline weight moves the progression's anchor to now, so
  // next week's suggestion is one increment past what was just typed rather
  // than stacking on top of however many weeks had already elapsed.
  function commitTargetWeight() {
    const patch: Partial<RoutineExerciseRowEntity> = {
      targetWeight: toNumericStringOrNull(targetWeight),
    };
    if (progressionEnabled) patch.progressionStartedAt = new Date();
    onUpdate(patch);
  }

  function toggleProgression(enabled: boolean) {
    setProgressionEnabled(enabled);
    onUpdate({
      progressionIncrement: enabled ? toNumericStringOrNull(increment) : null,
      progressionStartedAt: enabled ? new Date() : null,
    });
  }

  function commitIncrement() {
    if (!progressionEnabled) return;
    onUpdate({ progressionIncrement: toNumericStringOrNull(increment) });
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <button
            type="button"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
            className="mt-0.5 flex h-11 w-8 shrink-0 touch-none items-center justify-center text-zinc-400 dark:text-zinc-600"
          >
            ⠿
          </button>
          <span className="flex flex-col pt-2">
            <span className="text-base font-medium">{exerciseName}</span>
            {warmup && (
              <span className="text-xs font-medium text-orange-700 dark:text-orange-400">
                Warm-up
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove exercise"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-red-600 dark:text-red-500"
        >
          <Trash2 className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 pl-10">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Sets
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={targetSets}
            onChange={(event) => setTargetSets(event.target.value)}
            onBlur={() => onUpdate({ targetSets: toNumberOrNull(targetSets) })}
            className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        {warmup ? (
          warmup.timed ? (
            <label className="flex flex-col gap-1 text-xs font-medium">
              Hold (s)
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={durationSeconds}
                onChange={(event) => setDurationSeconds(event.target.value)}
                onBlur={() => onUpdate({ targetDurationSeconds: toNumberOrNull(durationSeconds) })}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-xs font-medium">
              Reps
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={repsLow}
                onChange={(event) => setRepsLow(event.target.value)}
                onBlur={() => {
                  const reps = toNumberOrNull(repsLow);
                  onUpdate({ targetRepsLow: reps, targetRepsHigh: reps });
                }}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
          )
        ) : (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Reps low
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={repsLow}
                onChange={(event) => setRepsLow(event.target.value)}
                onBlur={() => onUpdate({ targetRepsLow: toNumberOrNull(repsLow) })}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Reps high
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={repsHigh}
                onChange={(event) => setRepsHigh(event.target.value)}
                onBlur={() => onUpdate({ targetRepsHigh: toNumberOrNull(repsHigh) })}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Rest (s)
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={restSeconds}
                onChange={(event) => setRestSeconds(event.target.value)}
                onBlur={() => onUpdate({ targetRestSeconds: toNumberOrNull(restSeconds) })}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Weight ({units})
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={targetWeight}
                onChange={(event) => setTargetWeight(event.target.value)}
                onBlur={commitTargetWeight}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
          </>
        )}
      </div>

      {!warmup && (
        <div className="flex flex-wrap items-center gap-2 pl-10">
          <label className="flex items-center gap-1.5 text-xs font-medium">
            <input
              type="checkbox"
              checked={progressionEnabled}
              onChange={(event) => toggleProgression(event.target.checked)}
              className="h-4 w-4"
            />
            Auto-increase weekly
          </label>
          {progressionEnabled && (
            <label className="flex items-center gap-1 text-xs font-medium">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={increment}
                onChange={(event) => setIncrement(event.target.value)}
                onBlur={commitIncrement}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              {units}/week
            </label>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1 pl-10 text-xs font-medium">
        Notes
        <input
          type="text"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => onUpdate({ notes: notes.trim() || null })}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>
    </li>
  );
}
