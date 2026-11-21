"use client";

import { Check } from "@/components/icons/solar";
import type { SetRow as SetRowEntity } from "@/lib/db/schema";
import type { SetKind } from "@/lib/sessions/set-kinds";
import { type SetField, formatSetValue, setFieldEditPatch } from "@/lib/workout/set-field-edit";
import { normalizeDecimalInput } from "@jim/core";
import { useEffect, useRef, useState } from "react";
import { PrBadge } from "./pr-badge";
import { canUnlogSet } from "./session-set-ui";
import { SetKindMenu } from "./set-kind-menu";
import { SwipeDeleteReveal, useSwipeToDelete } from "./use-swipe-to-delete";

interface Props {
  set: SetRowEntity;
  /** The Set column's label: the set's number, or "W" for a warm-up. */
  label: string;
  isPr: boolean;
  /** A focused lift's working set logged without RPE doesn't count for DPR (issue #212). */
  rpeNudge?: boolean;
  /** False in Simple mode without PRP (issue #464): the RPE column is left out. */
  showRpe?: boolean;
  /** False when Settings → Advanced has set types off (issue #640). */
  showSetTypes?: boolean;
  /** True just after this set was logged here: the row ripples full from its ✓. */
  justLogged?: boolean;
  onEdit: (patch: { weight: number | null; reps: number | null; rpe: number | null }) => void;
  onChangeKind: (kind: SetKind) => void;
  onDelete: () => void;
  /** Tapping the ✓ takes the set back to a planned row (issue #645). */
  onUnlog: () => void;
}

const SIZES = {
  // Matches the entry inputs in session-exercise-section.tsx (issue #186):
  // centered, h-11 so the row keeps the height of its action buttons.
  input:
    "h-11 w-full min-w-0 rounded-xl border border-transparent bg-zinc-100 px-1 text-center text-xl font-semibold tabular-nums text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50",
  // pl-2 keeps the label off the tinted row's rounded edge (issue #391).
  indexCell: "py-2 pl-2 pr-2 align-middle text-xs font-medium text-zinc-500 dark:text-zinc-500",
  // Logged values line up under the centered entry inputs at the same size.
  cell: "py-2 pr-2 align-middle text-center text-xl tabular-nums",
  metaCell:
    "py-2 pr-2 align-middle text-center text-xl tabular-nums text-zinc-500 dark:text-zinc-500",
  // `relative` anchors the swipe-to-delete strip (issue #350).
  actionCell: "relative py-2 pl-1 pr-1 align-middle text-right whitespace-nowrap",
  // The buttons are block-level flex boxes, so without a row wrapper two of
  // them stack and the row doubles in height the moment a set is logged
  // (issue #157) — keep them side by side so logging happens in place.
  actionGroup: "flex min-w-22 items-center justify-end",
  // A logged value reads as plain text but is its own tap target (issue
  // #234): tapping it swaps in an input for just that value.
  valueButton: "min-h-11 w-full rounded-xl font-semibold tabular-nums",
  // Past five characters ("1002.5") a value drops a size, so a heavy or
  // fractional weight can't widen its column and push the ✓ off the card
  // (issue #646).
  longValue: "text-base",
  // The Log ✓ stays put once the set is logged (issue #318), in a quieter
  // "done" state. Tapping it unlogs the set (issue #645), never deletes it,
  // and only once the set has been logged a moment (`canUnlogSet`), so a
  // double tap on Log can't undo itself.
  doneMark: "press flex min-h-11 min-w-11 items-center justify-center",
  // A solid green ✓ marks the set done (#862), the same size as the Log
  // ring it replaces, so done can't be mistaken for "log this next".
  doneDot: "flex h-11 w-11 items-center justify-center rounded-full bg-done text-done-foreground",
  icon: "h-5 w-5",
  // A logged row sits on a green wash (#862). The transparent borders on the
  // cells leave a gap between two logged rows in the separated-border table.
  row: "[&>td]:border-y-2 [&>td]:border-transparent [&>td]:bg-done/10 [&>td]:bg-clip-padding [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl",
  // The just-logged ripple's clip: the whole row's pill, hung off the right
  // edge of the last cell (the only cell it can be positioned from).
  rippleClip:
    "set-logged-ripple pointer-events-none absolute inset-y-0 right-0 overflow-hidden rounded-lg",
  rippleWave: "absolute rounded-full bg-done",
};

// The ✓'s center sits this far in from the row's right edge: the action
// cell's pr-1 plus half the 44px done mark.
const RIPPLE_ORIGIN_RIGHT = 26;
// Matches the .set-logged-ripple animation in globals.css.
const RIPPLE_MS = 750;

interface Ripple {
  width: number;
  diameter: number;
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
  // Decimal fields are text, so a decimal comma isn't thrown away (#675).
  weight: { type: "text", inputMode: "decimal" },
  reps: { type: "number", inputMode: "numeric" },
  rpe: { type: "text", inputMode: "decimal" },
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
      {...INPUT_ATTRS[field]}
      // biome-ignore lint/a11y/noAutofocus: the input only exists because the value was just tapped
      autoFocus
      aria-label={label}
      value={draft}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(normalizeDecimalInput(event.target.value))}
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
  isPr,
  rpeNudge = false,
  showRpe = true,
  showSetTypes = true,
  justLogged = false,
  onEdit,
  onChangeKind,
  onDelete,
  onUnlog,
}: Props) {
  const sizes = SIZES;
  const [editingField, setEditingField] = useState<SetField | null>(null);
  const swipe = useSwipeToDelete(onDelete);
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [ripple, setRipple] = useState<Ripple | null>(null);

  // Logging a set ripples out from its ✓ to fill the row, then settles into
  // the row's done tint. Measured here because the wave hangs off the last
  // cell and has to reach the row's far corner.
  useEffect(() => {
    const row = rowRef.current;
    if (!justLogged || !row) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const { width, height } = row.getBoundingClientRect();
    const reach = Math.hypot(width - RIPPLE_ORIGIN_RIGHT, height / 2);
    setRipple({ width, diameter: Math.ceil(reach * 2) });
  }, [justLogged]);

  // Unmounted on a timer rather than animationend, which iOS can drop (#356).
  useEffect(() => {
    if (!ripple) return;
    const timer = window.setTimeout(() => setRipple(null), RIPPLE_MS);
    return () => window.clearTimeout(timer);
  }, [ripple]);

  function commit(field: SetField, raw: string) {
    // Empty, invalid or unchanged input just reverts to the logged value.
    const patch = setFieldEditPatch(set, field, raw);
    if (patch) onEdit(patch);
    setEditingField(null);
  }

  function editable(field: SetField, label: string, value: string | number | null) {
    // Synced sets carry the server's "100.00"; show them like phone-logged ones.
    const shown = formatSetValue(value);
    return (
      <EditableValue
        field={field}
        label={label}
        value={shown}
        editing={editingField === field}
        inputClassName={sizes.input}
        buttonClassName={
          shown.length > 5 ? `${sizes.valueButton} ${sizes.longValue}` : sizes.valueButton
        }
        onStartEdit={() => setEditingField(field)}
        onCommit={(raw) => commit(field, raw)}
        onCancel={() => setEditingField(null)}
      />
    );
  }

  return (
    // A logged set reads as plain numbers on a green row with a solid green
    // ✓ (#862), so it can't be confused with the boxed rows still to log.
    <tr {...swipe.rowProps} ref={rowRef} className={`${swipe.rowProps.className} ${sizes.row}`}>
      <td className={sizes.indexCell}>
        <SetKindMenu
          label={label}
          kind={set.kind}
          onChange={onChangeKind}
          onDelete={onDelete}
          showKinds={showSetTypes}
        />
      </td>
      {/* The PR badge is pinned to the cell's corner rather than sitting
          beside the weight: inline, its width widened the Weight column and
          pushed PR rows past the card's edge (issue #440). */}
      <td className={`relative ${sizes.cell}`}>
        <div className="font-medium">{editable("weight", "weight", set.weight)}</div>
        {isPr && editingField !== "weight" && <PrBadge className="absolute top-0.5 right-0.5" />}
      </td>
      <td className={sizes.cell}>{editable("reps", "reps", set.reps)}</td>
      {showRpe && (
        <td className={sizes.metaCell}>
          {rpeNudge && editingField !== "rpe" ? (
            <button
              type="button"
              onClick={() => setEditingField("rpe")}
              aria-label="Add RPE for PRP"
              className="min-h-11 w-full rounded-md border border-dashed border-accent px-1 text-xs font-medium leading-tight text-zinc-700 dark:text-zinc-300"
            >
              Add RPE
            </button>
          ) : (
            editable("rpe", "RPE", set.rpe)
          )}
        </td>
      )}
      <td className={sizes.actionCell}>
        <div className={sizes.actionGroup}>
          <button
            type="button"
            onClick={() => {
              if (canUnlogSet(set.completedAt, new Date())) onUnlog();
            }}
            aria-label={`Unlog ${label === "W" ? "warm-up set" : `set ${label}`}`}
            className={sizes.doneMark}
          >
            <span className={sizes.doneDot}>
              <Check className={sizes.icon} strokeWidth={2.5} aria-hidden="true" />
            </span>
          </button>
        </div>
        {ripple && (
          <span aria-hidden="true" className={sizes.rippleClip} style={{ width: ripple.width }}>
            <span
              className={sizes.rippleWave}
              style={{
                width: ripple.diameter,
                height: ripple.diameter,
                right: RIPPLE_ORIGIN_RIGHT - ripple.diameter / 2,
                top: `calc(50% - ${ripple.diameter / 2}px)`,
              }}
            />
          </span>
        )}
        <SwipeDeleteReveal reveal={swipe.reveal} armed={swipe.armed} />
      </td>
    </tr>
  );
}
