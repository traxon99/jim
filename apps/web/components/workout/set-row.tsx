"use client";

import type { SetRow as SetRowEntity } from "@/lib/db/schema";
import type { SetKind } from "@/lib/sessions/set-kinds";
import { RPE_MAX, RPE_MIN, clampRpe } from "@jim/core";
import { Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { SetKindMenu } from "./set-kind-menu";

interface Props {
  set: SetRowEntity;
  index: number;
  isPr: boolean;
  /** A focused lift's working set logged without RPE doesn't count for DPR (issue #212). */
  rpeNudge?: boolean;
  large?: boolean;
  onEdit: (patch: { weight: number | null; reps: number | null; rpe: number | null }) => void;
  onChangeKind: (kind: SetKind) => void;
  onDelete: () => void;
}

function toNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sizesFor(large: boolean) {
  return {
    // Matches the entry inputs in session-exercise-section.tsx (issue #186):
    // centered, h-11 so the row keeps the height of its action buttons.
    input: large
      ? "w-full min-w-0 rounded-md border border-zinc-300 bg-white px-1 py-2 text-center text-3xl tabular-nums text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      : "h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-1 text-center text-xl tabular-nums text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50",
    indexCell: large
      ? "py-3 pr-3 align-middle text-base font-medium text-zinc-500 dark:text-zinc-500"
      : "py-2 pr-2 align-middle text-xs font-medium text-zinc-500 dark:text-zinc-500",
    // Logged values line up under the centered entry inputs at the same size.
    cell: large
      ? "py-3 pr-3 align-middle text-center text-3xl tabular-nums"
      : "py-2 pr-2 align-middle text-center text-xl tabular-nums",
    metaCell: large
      ? "py-3 pr-3 align-middle text-center text-3xl tabular-nums text-zinc-500 dark:text-zinc-500"
      : "py-2 pr-2 align-middle text-center text-xl tabular-nums text-zinc-500 dark:text-zinc-500",
    actionCell: large
      ? "py-3 pl-1 align-middle text-right whitespace-nowrap"
      : "py-2 pl-1 align-middle text-right whitespace-nowrap",
    // The buttons are block-level flex boxes, so without a row wrapper two of
    // them stack and the row doubles in height the moment a set is logged
    // (issue #157) — keep them side by side so logging happens in place.
    actionGroup: "flex min-w-22 items-center justify-end",
    saveButton: large
      ? "min-h-12 rounded-md bg-accent px-4 text-base font-medium text-accent-foreground"
      : "min-h-11 rounded-md bg-accent px-2 text-xs font-medium text-accent-foreground",
    textButton: large
      ? "flex min-h-12 min-w-12 items-center justify-center rounded-md text-zinc-500 dark:text-zinc-500"
      : "flex min-h-11 min-w-11 items-center justify-center rounded-md text-zinc-500 dark:text-zinc-500",
    editButton: large
      ? "flex min-h-12 min-w-12 items-center justify-center rounded-md text-zinc-500 dark:text-zinc-500"
      : "flex min-h-11 min-w-11 items-center justify-center rounded-md text-zinc-500 dark:text-zinc-500",
    deleteButton: large
      ? "flex min-h-12 min-w-12 items-center justify-center rounded-md text-red-600 dark:text-red-500"
      : "flex min-h-11 min-w-11 items-center justify-center rounded-md text-red-600 dark:text-red-500",
    icon: large ? "h-5 w-5" : "h-4 w-4",
  };
}

export function SetRow({
  set,
  index,
  isPr,
  rpeNudge = false,
  large = false,
  onEdit,
  onChangeKind,
  onDelete,
}: Props) {
  const sizes = sizesFor(large);
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState(set.weight ?? "");
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [rpe, setRpe] = useState(set.rpe ?? "");

  function save() {
    const rpeValue = toNumberOrNull(rpe);
    onEdit({
      weight: toNumberOrNull(weight),
      reps: toNumberOrNull(reps),
      rpe: rpeValue == null ? null : clampRpe(rpeValue),
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <tr className="border-b border-zinc-100 bg-zinc-50 last:border-0 dark:border-zinc-800 dark:bg-zinc-900/50">
        <td className={sizes.indexCell}>
          <SetKindMenu index={index} kind={set.kind} onChange={onChangeKind} />
        </td>
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
          <input
            type="number"
            inputMode="decimal"
            min={RPE_MIN}
            max={RPE_MAX}
            step={0.5}
            value={rpe}
            onChange={(event) => setRpe(event.target.value)}
            className={sizes.input}
          />
        </td>
        <td className={sizes.actionCell}>
          <div className={sizes.actionGroup}>
            <button type="button" onClick={save} className={sizes.saveButton}>
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              aria-label="Cancel edit"
              className={sizes.textButton}
            >
              <X className={sizes.icon} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
      <td className={sizes.indexCell}>
        <SetKindMenu index={index} kind={set.kind} onChange={onChangeKind} />
      </td>
      <td className={sizes.cell}>
        <div className="flex items-center justify-center gap-1">
          <span className="font-medium">{set.weight ?? "—"}</span>
          {isPr && <span title="Personal record">🎉</span>}
        </div>
      </td>
      <td className={sizes.cell}>{set.reps ?? "—"}</td>
      <td className={sizes.metaCell}>
        {rpeNudge ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Add RPE for DPR"
            className="min-h-11 w-full rounded-md border border-dashed border-accent px-1 text-xs font-medium leading-tight text-zinc-700 dark:text-zinc-300"
          >
            Add RPE
          </button>
        ) : (
          (set.rpe ?? "—")
        )}
      </td>
      <td className={sizes.actionCell}>
        <div className={sizes.actionGroup}>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit set"
            className={sizes.editButton}
          >
            <Pencil className={sizes.icon} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Remove set"
            className={sizes.deleteButton}
          >
            <Trash2 className={sizes.icon} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
}
