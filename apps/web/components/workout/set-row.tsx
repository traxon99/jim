"use client";

import type { SetRow as SetRowEntity } from "@/lib/db/schema";
import { SET_KINDS } from "@/lib/sessions/set-kinds";
import { useState } from "react";

interface Props {
  set: SetRowEntity;
  index: number;
  isPr: boolean;
  large?: boolean;
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

function sizesFor(large: boolean) {
  return {
    input: large
      ? "w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-3 text-lg text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      : "w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50",
    indexCell: large
      ? "py-3 pr-3 align-middle text-base font-medium text-zinc-500 dark:text-zinc-500"
      : "py-2 pr-2 align-middle text-xs font-medium text-zinc-500 dark:text-zinc-500",
    cell: large ? "py-3 pr-3 align-top text-lg" : "py-2 pr-2 align-top text-sm",
    metaCell: large
      ? "py-3 pr-3 align-top text-base text-zinc-500 dark:text-zinc-500"
      : "py-2 pr-2 align-top text-xs text-zinc-500 dark:text-zinc-500",
    actionCell: large
      ? "py-3 pl-1 align-top text-right whitespace-nowrap"
      : "py-2 pl-1 align-top text-right whitespace-nowrap",
    saveButton: large
      ? "min-h-12 rounded-md bg-zinc-950 px-4 text-base font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
      : "min-h-11 rounded-md bg-zinc-950 px-2 text-xs font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950",
    textButton: large ? "min-h-12 px-2 text-base font-medium" : "min-h-11 px-1.5 text-xs",
    editButton: large
      ? "min-h-12 px-2 text-base font-medium underline underline-offset-4"
      : "min-h-11 px-1.5 text-xs font-medium underline underline-offset-4",
    deleteButton: large
      ? "min-h-12 px-2 text-base font-medium text-red-600 dark:text-red-500"
      : "min-h-11 px-1.5 text-xs font-medium text-red-600 dark:text-red-500",
  };
}

export function SetRow({ set, index, isPr, large = false, onEdit, onDelete }: Props) {
  const sizes = sizesFor(large);
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState(set.weight ?? "");
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [kind, setKind] = useState<SetRowEntity["kind"]>(set.kind);

  function save() {
    onEdit({ weight: toNumberOrNull(weight), reps: toNumberOrNull(reps), kind });
    setEditing(false);
  }

  if (editing) {
    return (
      <tr className="border-b border-zinc-100 bg-zinc-50 last:border-0 dark:border-zinc-800 dark:bg-zinc-900/50">
        <td className={sizes.indexCell}>{index + 1}</td>
        <td className={sizes.cell}>
          <input
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            className={sizes.input}
          />
        </td>
        <td className={sizes.cell}>
          <input
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(event) => setReps(event.target.value)}
            className={sizes.input}
          />
        </td>
        <td className={sizes.cell}>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as SetRowEntity["kind"])}
            className={sizes.input}
          >
            {SET_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </td>
        <td className={sizes.actionCell}>
          <button type="button" onClick={save} className={sizes.saveButton}>
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className={sizes.textButton}>
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
      <td className={sizes.indexCell}>{index + 1}</td>
      <td className={sizes.cell}>
        <div className="flex items-center gap-1">
          <span className="font-medium">{set.weight ?? "—"}</span>
          {isPr && <span title="Personal record">🎉</span>}
        </div>
      </td>
      <td className={sizes.cell}>{set.reps ?? "—"}</td>
      <td className={sizes.metaCell}>{set.kind !== "working" ? set.kind : "—"}</td>
      <td className={sizes.actionCell}>
        <button type="button" onClick={() => setEditing(true)} className={sizes.editButton}>
          Edit
        </button>
        <button type="button" onClick={onDelete} className={sizes.deleteButton}>
          Remove
        </button>
      </td>
    </tr>
  );
}
