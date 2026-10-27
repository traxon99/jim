"use client";

import type { SetRow as SetRowEntity } from "@/lib/db/schema";
import { needsRpeNudge } from "@/lib/dpr/calls";
import type { SetKind } from "@/lib/sessions/set-kinds";
import type { PreviousSet } from "@jim/core";
import type { ReactNode } from "react";
import { RpeInfoMenu } from "./rpe-info-menu";
import { SetKindMenu } from "./set-kind-menu";
import { SetRow } from "./set-row";
import { SwipeToDeleteRow } from "./use-swipe-to-delete";

interface Props {
  fieldId: string;
  large: boolean;
  showRpe: boolean;
  showSetTypes: boolean;
  hasDpr: boolean;
  sets: SetRowEntity[];
  lastSet: SetRowEntity | undefined;
  rowLabels: string[];
  visiblePlannedIndices: number[];
  nextIndex: number;
  nextLabel: string;
  justLoggedId: string | null;
  prSetIds: ReadonlySet<string>;
  sizes: Record<
    "headerRow" | "headerCell" | "prevCell" | "indexCell" | "cell" | "actionCell",
    string
  >;
  previousFor: (index: number) => PreviousSet | undefined;
  kindFor: (index: number) => SetKind;
  onChangeKind: (index: number, kind: SetKind) => void;
  onEdit: (
    set: SetRowEntity,
    patch: { weight: number | null; reps: number | null; rpe: number | null },
  ) => void;
  onChangeLoggedKind: (set: SetRowEntity, kind: SetKind) => void;
  onDelete: (set: SetRowEntity) => void;
  onSkip: (index: number) => void;
  onFillPrevious: (index: number) => void;
  renderInputs: (index: number) => { weight: ReactNode; reps: ReactNode; rpe: ReactNode };
  renderLogButton: (index: number, label: string) => ReactNode;
  repeatButton: ReactNode;
}

/** Shared table for list and Focus view; planning and persistence stay with the session. */
export function SessionSetTable({
  fieldId,
  large,
  showRpe,
  showSetTypes,
  hasDpr,
  sets,
  lastSet,
  rowLabels,
  visiblePlannedIndices,
  nextIndex,
  nextLabel,
  justLoggedId,
  prSetIds,
  sizes,
  previousFor,
  kindFor,
  onChangeKind,
  onEdit,
  onChangeLoggedKind,
  onDelete,
  onSkip,
  onFillPrevious,
  renderInputs,
  renderLogButton,
  repeatButton,
}: Props) {
  const tableHead = (
    <thead>
      <tr className={sizes.headerRow}>
        <th className={`w-8 pl-2 ${sizes.headerCell}`}>Set</th>
        <th className={`text-center ${sizes.headerCell}`}>Prev</th>
        <th className={`text-center ${sizes.headerCell}`}>Weight</th>
        {/* Reps and RPE are pinned narrow (issue #323) so, beside the Prev
            column, Weight still fits "315.5" at text-xl on a ~325px table. */}
        <th className={`w-11 text-center ${sizes.headerCell}`}>Reps</th>
        {showRpe && (
          <th className={`w-12 text-center ${sizes.headerCell}`}>
            <RpeInfoMenu titleId={`${fieldId}-rpe-label`} />
          </th>
        )}
        <th className={sizes.headerCell} />
      </tr>
    </thead>
  );
  function previousValues(index: number) {
    const prior = previousFor(index);
    if (!prior || (prior.weight == null && prior.reps == null)) return <span>—</span>;
    return (
      <span className="flex flex-col items-center">
        <span>{prior.weight ?? "—"}</span>
        <span>×{prior.reps ?? "—"}</span>
      </span>
    );
  }
  function loggedRow(set: SetRowEntity, label: string) {
    return (
      <SetRow
        key={set.id}
        set={set}
        label={label}
        previous={<td className={sizes.prevCell}>{previousValues(set.setIndex)}</td>}
        isPr={set.kind !== "warmup" && prSetIds.has(set.id)}
        rpeNudge={needsRpeNudge(hasDpr, set)}
        showRpe={showRpe}
        showSetTypes={showSetTypes}
        justLogged={set.id === justLoggedId}
        onEdit={(patch) => void onEdit(set, patch)}
        onChangeKind={(kind) => void onChangeLoggedKind(set, kind)}
        onDelete={() => void onDelete(set)}
      />
    );
  }
  // In the list, a planned row swipes away like a logged one (issue #350);
  // the focus view's single next row always stays.
  function plannedRow(index: number, label: string, removable: boolean) {
    const inputs = renderInputs(index);
    const remove = removable ? () => onSkip(index) : undefined;
    return (
      <SwipeToDeleteRow key={index} onDelete={remove}>
        {(reveal) => (
          <>
            <td className={sizes.indexCell}>
              <SetKindMenu
                label={label}
                kind={kindFor(index)}
                onChange={(kind) => onChangeKind(index, kind)}
                onDelete={remove}
                showKinds={showSetTypes}
              />
            </td>
            <td className={sizes.prevCell}>
              {previousFor(index) ? (
                <button
                  type="button"
                  onClick={() => onFillPrevious(index)}
                  aria-label={`Use last time's ${label === "W" ? "warm-up set" : `set ${label}`}`}
                  className="min-h-11 w-full"
                >
                  {previousValues(index)}
                </button>
              ) : (
                previousValues(index)
              )}
            </td>
            <td className={sizes.cell}>{inputs.weight}</td>
            <td className={sizes.cell}>{inputs.reps}</td>
            {showRpe && <td className={sizes.cell}>{inputs.rpe}</td>}
            <td className={sizes.actionCell}>
              <div className="flex min-w-22 items-center justify-end">
                {index === nextIndex && repeatButton}
                {renderLogButton(index, label)}
              </div>
              {reveal}
            </td>
          </>
        )}
      </SwipeToDeleteRow>
    );
  }

  return (
    // Clips a row sliding left to delete so it cannot widen the page (#350).
    <div className="overflow-x-clip">
      <table className="w-full border-separate border-spacing-y-1 text-left">
        {tableHead}
        <tbody>
          {large ? (
            <>
              {lastSet && loggedRow(lastSet, rowLabels[sets.length - 1] ?? String(sets.length))}
              {visiblePlannedIndices.length > 0 && plannedRow(nextIndex, nextLabel, false)}
            </>
          ) : (
            <>
              {sets.map((set, i) => loggedRow(set, rowLabels[i] ?? String(i + 1)))}
              {visiblePlannedIndices.map((index, i) =>
                plannedRow(index, rowLabels[sets.length + i] ?? String(index + 1), true),
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
