"use client";

import type { SetRow as SetRowEntity } from "@/lib/db/schema";
import { needsRpeNudge } from "@/lib/dpr/calls";
import type { SetKind } from "@/lib/sessions/set-kinds";
import type { ReactNode } from "react";
import { RpeInfoMenu } from "./rpe-info-menu";
import type { SessionSetTableSizes } from "./session-set-ui";
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
  sizes: SessionSetTableSizes;
  /** The Weight column's heading: the user's unit ("lb" or "kg"). */
  weightLabel: string;
  kindFor: (index: number) => SetKind;
  onChangeKind: (index: number, kind: SetKind) => void;
  onEdit: (
    set: SetRowEntity,
    patch: { weight: number | null; reps: number | null; rpe: number | null },
  ) => void;
  onChangeLoggedKind: (set: SetRowEntity, kind: SetKind) => void;
  onDelete: (set: SetRowEntity) => void;
  onUnlog: (set: SetRowEntity) => void;
  onSkip: (index: number) => void;
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
  weightLabel,
  kindFor,
  onChangeKind,
  onEdit,
  onChangeLoggedKind,
  onDelete,
  onUnlog,
  onSkip,
  renderInputs,
  renderLogButton,
  repeatButton,
}: Props) {
  const tableHead = (
    <thead>
      <tr className={sizes.headerRow}>
        <th className={`w-9 pl-2 ${sizes.headerCell}`}>Set</th>
        <th className={`text-center ${sizes.headerCell}`}>{weightLabel}</th>
        {/* Reps and RPE stay narrow so Weight fits "1002.5" (#646). */}
        <th className={`w-14 text-center ${sizes.headerCell}`}>Reps</th>
        {showRpe && (
          <th className={`w-14 text-center ${sizes.headerCell}`}>
            <RpeInfoMenu titleId={`${fieldId}-rpe-label`} />
          </th>
        )}
        <th className={sizes.headerCell} />
      </tr>
    </thead>
  );
  function loggedRow(set: SetRowEntity, label: string) {
    return (
      <SetRow
        key={set.id}
        set={set}
        label={label}
        isPr={set.kind !== "warmup" && prSetIds.has(set.id)}
        rpeNudge={needsRpeNudge(hasDpr, set)}
        showRpe={showRpe}
        showSetTypes={showSetTypes}
        justLogged={set.id === justLoggedId}
        onEdit={(patch) => void onEdit(set, patch)}
        onChangeKind={(kind) => void onChangeLoggedKind(set, kind)}
        onDelete={() => void onDelete(set)}
        onUnlog={() => void onUnlog(set)}
      />
    );
  }
  // In the list, a planned row swipes away like a logged one (issue #350);
  // the focus view's single next row always stays.
  function plannedRow(index: number, label: string, removable: boolean) {
    const inputs = renderInputs(index);
    const remove = removable ? () => onSkip(index) : undefined;
    // Untinted (#862): a tinted row is what a logged set looks like now, so
    // the next set stands out by its solid Log ring instead. The transparent
    // borders match a logged row's, so logging a set doesn't shift the card.
    return (
      <SwipeToDeleteRow
        key={index}
        onDelete={remove}
        className="[&>td]:border-y-2 [&>td]:border-transparent"
      >
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
      <table className="w-full border-separate border-spacing-0 text-left">
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
