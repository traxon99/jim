"use client";

import type { SetRow as SetRowEntity, SettingsRow } from "@/lib/db/schema";
import { SET_KINDS } from "@/lib/sessions/set-kinds";
import { useState } from "react";
import { PlateBreakdown, isBarbellExercise } from "./plate-breakdown";

interface Props {
  set: SetRowEntity;
  index: number;
  equipment: string | null;
  settings: SettingsRow;
  isPr: boolean;
  onEdit: (patch: {
    weight: number | null;
    reps: number | null;
    kind: SetRowEntity["kind"];
  }) => void;
  onDelete: () => void;
}

function toNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function SetRow({ set, index, equipment, settings, isPr, onEdit, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState(set.weight ?? "");
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [kind, setKind] = useState<SetRowEntity["kind"]>(set.kind);

  const weightNum = set.weight == null ? null : Number(set.weight);

  function save() {
    onEdit({ weight: toNumberOrNull(weight), reps: toNumberOrNull(reps), kind });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Weight
          <input
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Reps
          <input
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(event) => setReps(event.target.value)}
            className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Kind
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as SetRowEntity["kind"])}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {SET_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={save}
          className="min-h-11 rounded-lg bg-zinc-950 px-3 text-sm font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
        >
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="min-h-11 px-2 text-sm">
          Cancel
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500">#{index + 1}</span>
          <span className="text-base font-medium">
            {set.weight != null && set.reps != null ? `${set.weight} × ${set.reps}` : "—"}
          </span>
          {set.kind !== "working" && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {set.kind}
            </span>
          )}
          {isPr && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              🎉 PR
            </span>
          )}
        </div>
        {weightNum != null && isBarbellExercise(equipment) && (
          <PlateBreakdown weight={weightNum} settings={settings} />
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="min-h-11 px-2 text-sm font-medium underline underline-offset-4"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="min-h-11 px-2 text-sm font-medium text-red-600 dark:text-red-500"
        >
          Remove
        </button>
      </div>
    </li>
  );
}
