"use client";

import type { RoutineExerciseRow as RoutineExerciseRowEntity } from "@/lib/db/schema";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

interface Props {
  item: RoutineExerciseRowEntity;
  exerciseName: string;
  onUpdate: (patch: Partial<RoutineExerciseRowEntity>) => void;
  onRemove: () => void;
}

function toNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function RoutineExerciseRow({ item, exerciseName, onUpdate, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const [targetSets, setTargetSets] = useState(item.targetSets?.toString() ?? "");
  const [repsLow, setRepsLow] = useState(item.targetRepsLow?.toString() ?? "");
  const [repsHigh, setRepsHigh] = useState(item.targetRepsHigh?.toString() ?? "");
  const [restSeconds, setRestSeconds] = useState(item.targetRestSeconds?.toString() ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");

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
          <span className="pt-2 text-base font-medium">{exerciseName}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 px-1 py-2 text-sm font-medium text-red-600 dark:text-red-500"
        >
          Remove
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
      </div>

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
