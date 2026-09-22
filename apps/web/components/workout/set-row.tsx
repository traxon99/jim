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

const inputClasses =
  "w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

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
      <tr className="border-b border-zinc-100 bg-zinc-50 last:border-0 dark:border-zinc-800 dark:bg-zinc-900/50">
        <td className="py-1.5 pr-2 align-middle text-xs font-medium text-zinc-500 dark:text-zinc-500">
          {index + 1}
        </td>
        <td className="py-1.5 pr-2 align-middle">
          <input
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            className={inputClasses}
          />
        </td>
        <td className="py-1.5 pr-2 align-middle">
          <input
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(event) => setReps(event.target.value)}
            className={inputClasses}
          />
        </td>
        <td className="py-1.5 pr-2 align-middle">
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as SetRowEntity["kind"])}
            className={inputClasses}
          >
            {SET_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </td>
        <td className="py-1.5 pl-1 align-middle text-right whitespace-nowrap">
          <button
            type="button"
            onClick={save}
            className="min-h-11 rounded-md bg-zinc-950 px-2 text-xs font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="min-h-11 px-1.5 text-xs"
          >
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
      <td className="py-2 pr-2 align-top text-xs font-medium text-zinc-500 dark:text-zinc-500">
        {index + 1}
      </td>
      <td className="py-2 pr-2 align-top text-sm">
        <div className="flex items-center gap-1">
          <span className="font-medium">{set.weight ?? "—"}</span>
          {isPr && <span title="Personal record">🎉</span>}
        </div>
        {weightNum != null && isBarbellExercise(equipment) && (
          <PlateBreakdown weight={weightNum} settings={settings} />
        )}
      </td>
      <td className="py-2 pr-2 align-top text-sm">{set.reps ?? "—"}</td>
      <td className="py-2 pr-2 align-top text-xs text-zinc-500 dark:text-zinc-500">
        {set.kind !== "working" ? set.kind : "—"}
      </td>
      <td className="py-2 pl-1 align-top text-right whitespace-nowrap">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="min-h-11 px-1.5 text-xs font-medium underline underline-offset-4"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="min-h-11 px-1.5 text-xs font-medium text-red-600 dark:text-red-500"
        >
          Remove
        </button>
      </td>
    </tr>
  );
}
