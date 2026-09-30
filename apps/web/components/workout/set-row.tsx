"use client";

import type { SetRow as SetRowEntity } from "@/lib/db/schema";
import type { SetKind } from "@/lib/sessions/set-kinds";
import { type SetField, setFieldEditPatch } from "@/lib/workout/set-field-edit";
import { RPE_MAX, RPE_MIN } from "@jim/core";
import { Check } from "lucide-react";
import { useRef, useState } from "react";
import { SetKindMenu } from "./set-kind-menu";
import { SwipeDeleteReveal, useSwipeToDelete } from "./use-swipe-to-delete";

interface Props {
  set: SetRowEntity;
  /** The Set column's label: the set's number, or "W" for a warm-up. */
  label: string;
  /** The Prev column's cell (issue #323): last session's same set. */
  previous: React.ReactNode;
  isPr: boolean;
  /** A focused lift's working set logged without RPE doesn't count for DPR (issue #212). */
  rpeNudge?: boolean;
  large?: boolean;
  onEdit: (patch: { weight: number | null; reps: number | null; rpe: number | null }) => void;
  onChangeKind: (kind: SetKind) => void;
  onDelete: () => void;
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
    // `relative` anchors the swipe-to-delete strip (issue #350).
    actionCell: large
      ? "relative py-3 pl-1 align-middle text-right whitespace-nowrap"
      : "relative py-2 pl-1 align-middle text-right whitespace-nowrap",
    // The buttons are block-level flex boxes, so without a row wrapper two of
    // them stack and the row doubles in height the moment a set is logged
    // (issue #157) — keep them side by side so logging happens in place.
    actionGroup: "flex min-w-22 items-center justify-end",
    // A logged value reads as plain text but is its own tap target (issue
    // #234): tapping it swaps in an input for just that value.
    valueButton: large
      ? "min-h-12 w-full rounded-md tabular-nums"
      : "min-h-11 w-full rounded-md tabular-nums",
    // The Log ✓ stays put once the set is logged (issue #318), in a quieter
    // "done" state and not a button: a second tap in the same spot does
    // nothing, rather than landing on a delete button.
    doneMark: large
      ? "flex min-h-12 min-w-12 items-center justify-center rounded-md text-accent"
      : "flex min-h-11 min-w-11 items-center justify-center rounded-md text-accent",
    icon: large ? "h-5 w-5" : "h-4 w-4",
  };
}

interface EditableValueProps {
  field: SetField;
  label: string;
  value: string;
  editing: boolean;
  inputClassName: string;
  buttonClassName: string;
  onStartEdit: () => void;
  onCommit: (raw: string) => void;
  onCancel: () => void;
}

const INPUT_ATTRS: Record<SetField, React.InputHTMLAttributes<HTMLInputElement>> = {
  weight: { inputMode: "decimal" },
  reps: { inputMode: "numeric" },
  rpe: { inputMode: "decimal", min: RPE_MIN, max: RPE_MAX, step: 0.5 },
};

function EditableValue({
  field,
  label,
  value,
  editing,
  inputClassName,
  buttonClassName,
  onStartEdit,
  onCommit,
  onCancel,
}: EditableValueProps) {
  const [draft, setDraft] = useState(value);
  // Escape blurs the input on its way out; this stops that blur saving.
  const cancelled = useRef(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          cancelled.current = false;
          onStartEdit();
        }}
        aria-label={`Edit ${label}`}
        className={buttonClassName}
      >
        {value === "" ? "—" : value}
      </button>
    );
  }

  return (
    <input
      type="number"
      {...INPUT_ATTRS[field]}
      // biome-ignore lint/a11y/noAutofocus: the input only exists because the value was just tapped
      autoFocus
      aria-label={label}
      value={draft}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          cancelled.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (cancelled.current) return;
        onCommit(draft);
      }}
      className={inputClassName}
    />
  );
}

export function SetRow({
  set,
  label,
  previous,
  isPr,
  rpeNudge = false,
  large = false,
  onEdit,
  onChangeKind,
  onDelete,
}: Props) {
  const sizes = sizesFor(large);
  const [editingField, setEditingField] = useState<SetField | null>(null);
  const swipe = useSwipeToDelete(onDelete);

  function commit(field: SetField, raw: string) {
    // Empty, invalid or unchanged input just reverts to the logged value.
    const patch = setFieldEditPatch(set, field, raw);
    if (patch) onEdit(patch);
    setEditingField(null);
  }

  function editable(field: SetField, label: string, value: string | number | null) {
    return (
      <EditableValue
        field={field}
        label={label}
        value={value == null ? "" : String(value)}
        editing={editingField === field}
        inputClassName={sizes.input}
        buttonClassName={sizes.valueButton}
        onStartEdit={() => setEditingField(field)}
        onCommit={(raw) => commit(field, raw)}
        onCancel={() => setEditingField(null)}
      />
    );
  }

  return (
    // A tinted row marks the set done at a glance (issue #319), like Strong's
    // and Hevy's completed rows.
    <tr
      {...swipe.rowProps}
      className={`border-b border-zinc-100 bg-accent/10 last:border-0 dark:border-zinc-800 ${swipe.rowProps.className}`}
    >
      <td className={sizes.indexCell}>
        <SetKindMenu label={label} kind={set.kind} onChange={onChangeKind} onDelete={onDelete} />
      </td>
      {previous}
      <td className={sizes.cell}>
        <div className="flex items-center justify-center gap-1 font-medium">
          {editable("weight", "weight", set.weight)}
          {isPr && editingField !== "weight" && <span title="Personal record">🎉</span>}
        </div>
      </td>
      <td className={sizes.cell}>{editable("reps", "reps", set.reps)}</td>
      <td className={sizes.metaCell}>
        {rpeNudge && editingField !== "rpe" ? (
          <button
            type="button"
            onClick={() => setEditingField("rpe")}
            aria-label="Add RPE for DPR"
            className="min-h-11 w-full rounded-md border border-dashed border-accent px-1 text-xs font-medium leading-tight text-zinc-700 dark:text-zinc-300"
          >
            Add RPE
          </button>
        ) : (
          editable("rpe", "RPE", set.rpe)
        )}
      </td>
      <td className={sizes.actionCell}>
        <div className={sizes.actionGroup}>
          <span role="img" aria-label="Logged" className={sizes.doneMark}>
            <Check className={sizes.icon} strokeWidth={2.25} aria-hidden="true" />
          </span>
        </div>
        <SwipeDeleteReveal reveal={swipe.reveal} armed={swipe.armed} />
      </td>
    </tr>
  );
}
