"use client";

import { mutate } from "@/lib/db/mutate";
import {
  type ExerciseRow,
  type RoutineExerciseRow,
  type SessionExerciseRow,
  type SetRow as SetRowEntity,
  type SettingsRow,
  db,
} from "@/lib/db/schema";
import {
  type DprCallInfo,
  dprBadge,
  dprRepsPlaceholder,
  dprWeightPlaceholder,
  dprWhyLine,
  needsRpeNudge,
} from "@/lib/dpr/calls";
import { loadPreviousSetsByIndex } from "@/lib/sessions/previous-set-lookup";
import { completeSet, deleteSet, editSet, updateSetKind } from "@/lib/sessions/set-actions";
import { type SetKind, setNumberLabels } from "@/lib/sessions/set-kinds";
import { STRENGTH_TIER_LABELS } from "@/lib/strength-standards/labels";
import { strengthProfileFromSettings } from "@/lib/strength-standards/profile";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type PrCandidate,
  type PreviousSet,
  RPE_MAX,
  RPE_MIN,
  STRENGTH_STANDARD_TIERS,
  clampRpe,
  plannedSetIndices,
  prefillWeightForSet,
  remainingPlannedSetCount,
  resolveCurrentRows,
  standardLiftForSlug,
  suggestedWeightsByTier,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { RpeInfoMenu } from "./rpe-info-menu";
import { SetKindMenu } from "./set-kind-menu";
import { SetRow } from "./set-row";

interface Props {
  sessionId: string;
  userId: string;
  item: SessionExerciseRow;
  exercise: ExerciseRow | undefined;
  target: RoutineExerciseRow | undefined;
  settings: SettingsRow;
  /** DPR's call when this is a focused lift and DPR is on (issue #212); else null. */
  dpr?: DprCallInfo | null;
  large?: boolean;
  /**
   * Called after a set is logged, with this exercise's rest and how many of
   * its planned sets are still unlogged (issue #231: zero on the final set
   * of the workout means there's nothing to rest for).
   */
  onSetLogged: (restSeconds: number, remainingPlannedSets: number) => void;
  onRemove: () => void;
}

function toNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toRpeOrNull(value: string): number | null {
  const n = toNumberOrNull(value);
  return n == null ? null : clampRpe(n);
}

interface DraftValues {
  weight: string;
  reps: string;
  rpe: string;
  kind: SetKind;
}

function sizesFor(large: boolean) {
  return {
    title: large ? "text-2xl font-bold" : "text-base font-semibold",
    removeButton: large
      ? "flex min-h-12 min-w-12 items-center justify-center rounded-md text-red-600 dark:text-red-500"
      : "flex min-h-11 min-w-11 items-center justify-center rounded-md text-red-600 dark:text-red-500",
    meta: large
      ? "text-base text-zinc-500 dark:text-zinc-500"
      : "text-xs text-zinc-500 dark:text-zinc-500",
    headerRow: large
      ? "border-b border-zinc-200 text-sm font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-500"
      : "border-b border-zinc-200 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-500",
    headerCell: large ? "py-2 pr-3 font-medium" : "py-1 pr-2 font-medium",
    indexCell: large
      ? "py-3 pr-3 align-middle text-base font-medium text-zinc-500 dark:text-zinc-500"
      : "py-2 pr-2 align-middle text-xs font-medium text-zinc-500 dark:text-zinc-500",
    cell: large ? "py-3 pr-3 align-middle" : "py-2 pr-2 align-middle",
    actionCell: large
      ? "py-3 pl-1 align-middle text-right whitespace-nowrap"
      : "py-2 pl-1 align-middle text-right whitespace-nowrap",
    // Values are centered and sized as large as the row allows (issue #186):
    // the compact input is pinned to h-11, the same height as the log/repeat
    // buttons beside it, so the row doesn't grow; text-xl is the largest size
    // where a five-character weight ("315.5") still fits the ~60px column on
    // an iPhone 16. The large layout keeps its original 54px box height
    // (py-2 + text-3xl's 36px line) with ~95px columns to fill.
    input: large
      ? "w-full min-w-0 rounded-md border border-zinc-300 bg-white px-1 py-2 text-center text-3xl tabular-nums text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      : "h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-1 text-center text-xl tabular-nums text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50",
    logButton: large
      ? "min-h-14 flex-1 rounded-lg bg-accent px-4 text-lg font-semibold text-accent-foreground"
      : "flex min-h-11 min-w-11 items-center justify-center rounded-md bg-accent text-accent-foreground",
    repeatButton: large
      ? "flex min-h-14 min-w-14 items-center justify-center rounded-lg border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
      : "flex min-h-11 min-w-11 items-center justify-center rounded-md text-zinc-500 dark:text-zinc-500",
    fieldLabel: "flex flex-col gap-1 text-sm font-medium text-zinc-500 dark:text-zinc-400",
    icon: large ? "h-5 w-5" : "h-4 w-4",
    notesLabel: large
      ? "flex flex-col gap-1 text-base font-medium"
      : "flex flex-col gap-1 text-xs font-medium",
    notesInput: large
      ? "rounded-lg border border-zinc-300 bg-white px-3 py-3 text-lg text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      : "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50",
  };
}

export function SessionExerciseSection({
  sessionId,
  userId,
  item,
  exercise,
  target,
  settings,
  dpr = null,
  large = false,
  onSetLogged,
  onRemove,
}: Props) {
  const sizes = sizesFor(large);
  const fieldId = useId();
  const rawSets = useLiveQuery(
    () => db.sets.where("sessionExerciseId").equals(item.id).toArray(),
    [item.id],
  );
  const [previousByIndex, setPreviousByIndex] = useState<Map<number, PreviousSet>>(new Map());
  const [prsBySetId, setPrsBySetId] = useState<Map<string, PrCandidate[]>>(new Map());
  const [notes, setNotes] = useState(item.notes ?? "");
  const [notesOpen, setNotesOpen] = useState(!large || Boolean(item.notes));
  const [draftOverrides, setDraftOverrides] = useState<Map<number, DraftValues>>(new Map());

  useEffect(() => {
    let cancelled = false;
    void loadPreviousSetsByIndex(item.exerciseId, sessionId).then((map) => {
      if (!cancelled) setPreviousByIndex(map);
    });
    return () => {
      cancelled = true;
    };
  }, [item.exerciseId, sessionId]);

  const sets = useMemo(() => {
    return resolveCurrentRows(rawSets ?? [])
      .filter((set) => !set.deletedAt)
      .sort((a, b) => a.setIndex - b.setIndex);
  }, [rawSets]);

  const nextIndex = sets.length;
  const previous = previousByIndex.get(nextIndex);
  const lastSet = sets[sets.length - 1];
  const restSeconds = target?.targetRestSeconds ?? (Number(settings.defaultRestSeconds) || 90);

  const loggedIndices = useMemo(() => new Set(sets.map((set) => set.setIndex)), [sets]);

  // The routine's target weight is the starting point for an exercise with
  // no history yet (the weekly auto-increment it once drove is replaced by
  // DPR, issue #217).
  const targetWeight = target?.targetWeight == null ? null : Number(target.targetWeight);

  // Strength-standard weight suggestions (#94): only for the four lifts
  // packages/core has published standards for, and only once sex + bodyweight
  // are on the profile (age is optional — see strengthProfileFromSettings).
  const standardLift = useMemo(() => standardLiftForSlug(exercise?.slug), [exercise?.slug]);
  const strengthProfile = useMemo(() => strengthProfileFromSettings(settings), [settings]);

  // Preloaded sets (issue #121): every not-yet-logged set the routine or last
  // time's workout calls for gets its own row, ready to log one tap at a
  // time. `draftOverrides` holds only rows the lifter has actually edited;
  // everything else is computed fresh from the plan/history on every render,
  // so it stays current as `previousByIndex` loads in.
  const plannedIndices = useMemo(
    () => plannedSetIndices(target?.targetSets ?? null, previousByIndex.size, loggedIndices),
    [target?.targetSets, previousByIndex, loggedIndices],
  );

  // Suggested weight/reps for a not-yet-logged row (issue #159): last time's
  // numbers at this position, or the routine's target, same source as before
  // — but now shown only as a background suggestion (the input's placeholder,
  // matching the warm-up logger) rather than typed into the field. Logging
  // with the field left blank falls back to this suggestion, same as a
  // warm-up set left blank falls back to its target. For a DPR-focused lift
  // (issue #212), DPR's weight — and after a change, the bottom of the rep
  // range — replaces both on working sets, still just a placeholder.
  function remainingAfterLogging(index: number): number {
    return remainingPlannedSetCount(
      target?.targetSets ?? null,
      previousByIndex.size,
      new Set([...loggedIndices, index]),
    );
  }

  function suggestedWeightFor(index: number): string {
    return (
      dprWeightPlaceholder(dpr, draftFor(index).kind) ??
      prefillWeightForSet(index, previousByIndex.get(index), targetWeight)
    );
  }
  function suggestedRepsFor(index: number): string {
    const dprReps = dprRepsPlaceholder(dpr, draftFor(index).kind);
    if (dprReps !== null) return dprReps;
    const priorAtIndex = previousByIndex.get(index);
    return priorAtIndex?.reps != null
      ? String(priorAtIndex.reps)
      : (target?.targetRepsLow?.toString() ?? "");
  }

  function defaultDraft(): DraftValues {
    return {
      weight: "",
      reps: "",
      rpe: "",
      kind: "working",
    };
  }

  function draftFor(index: number): DraftValues {
    return draftOverrides.get(index) ?? defaultDraft();
  }

  function updateDraft(index: number, patch: Partial<DraftValues>) {
    setDraftOverrides((current) => {
      const next = new Map(current);
      next.set(index, { ...(current.get(index) ?? defaultDraft()), ...patch });
      return next;
    });
  }

  const nextDraft = draftFor(nextIndex);

  // Warm-ups show "W" and working sets are numbered from 1 after them (issue
  // #220), across logged rows followed by the planned rows still to log.
  const rowLabels = setNumberLabels([
    ...sets.map((set) => set.kind),
    ...plannedIndices.map((index) => draftFor(index).kind),
  ]);
  const nextLabel = setNumberLabels([...sets.map((set) => set.kind), nextDraft.kind]).at(-1) ?? "1";
  const suggestionReps =
    toNumberOrNull(nextDraft.reps) ?? previous?.reps ?? target?.targetRepsLow ?? 5;
  const suggestedWeights = useMemo(() => {
    if (!standardLift || !strengthProfile) return null;
    return suggestedWeightsByTier(standardLift, strengthProfile, suggestionReps);
  }, [standardLift, strengthProfile, suggestionReps]);

  async function logRow(index: number) {
    const draft = draftFor(index);
    const weight = toNumberOrNull(draft.weight) ?? toNumberOrNull(suggestedWeightFor(index));
    const reps = toNumberOrNull(draft.reps) ?? toNumberOrNull(suggestedRepsFor(index));
    const { set, prs } = await completeSet({
      userId,
      sessionExerciseId: item.id,
      exerciseId: item.exerciseId,
      setIndex: index,
      kind: draft.kind,
      weight,
      reps,
      rpe: toRpeOrNull(draft.rpe),
    });
    if (prs.length > 0) setPrsBySetId((map) => new Map(map).set(set.id, prs));
    setDraftOverrides((current) => {
      if (!current.has(index)) return current;
      const next = new Map(current);
      next.delete(index);
      return next;
    });
    onSetLogged(restSeconds, remainingAfterLogging(index));
  }

  async function repeatLast() {
    if (!lastSet) return;
    const { set, prs } = await completeSet({
      userId,
      sessionExerciseId: item.id,
      exerciseId: item.exerciseId,
      setIndex: nextIndex,
      kind: lastSet.kind,
      weight: lastSet.weight == null ? null : Number(lastSet.weight),
      reps: lastSet.reps,
      rpe: lastSet.rpe == null ? null : Number(lastSet.rpe),
    });
    if (prs.length > 0) setPrsBySetId((map) => new Map(map).set(set.id, prs));
    onSetLogged(restSeconds, remainingAfterLogging(nextIndex));
  }

  async function handleEdit(
    original: SetRowEntity,
    patch: { weight: number | null; reps: number | null; rpe: number | null },
  ) {
    await editSet({ original, ...patch, kind: original.kind });
  }

  async function handleChangeKind(original: SetRowEntity, kind: SetKind) {
    await updateSetKind(original, kind);
  }

  async function handleNotesBlur() {
    const deviceId = await getDeviceId();
    await mutate("sessionExercises", {
      ...item,
      notes: notes.trim() || null,
      updatedAt: new Date(),
      deviceId,
    });
  }

  function weightInputFor(index: number, draft: DraftValues) {
    return (
      <input
        id={index === nextIndex ? `${fieldId}-weight` : undefined}
        type="number"
        inputMode="decimal"
        placeholder={suggestedWeightFor(index)}
        value={draft.weight}
        onChange={(event) => updateDraft(index, { weight: event.target.value })}
        className={sizes.input}
      />
    );
  }
  function repsInputFor(index: number, draft: DraftValues) {
    return (
      <input
        id={index === nextIndex ? `${fieldId}-reps` : undefined}
        type="number"
        inputMode="numeric"
        placeholder={suggestedRepsFor(index)}
        value={draft.reps}
        onChange={(event) => updateDraft(index, { reps: event.target.value })}
        className={sizes.input}
      />
    );
  }
  function rpeInputFor(index: number, draft: DraftValues) {
    return (
      <input
        id={index === nextIndex ? `${fieldId}-rpe` : undefined}
        aria-labelledby={index === nextIndex ? `${fieldId}-rpe-label` : undefined}
        type="number"
        inputMode="decimal"
        min={RPE_MIN}
        max={RPE_MAX}
        step={0.5}
        placeholder={dpr && draft.kind === "working" ? "RPE" : "—"}
        value={draft.rpe}
        onChange={(event) => updateDraft(index, { rpe: event.target.value })}
        className={
          // Soft-required on focused lifts: sessions without RPE don't count.
          dpr && draft.kind === "working"
            ? `${sizes.input} border-accent ring-1 ring-accent dark:border-accent`
            : sizes.input
        }
      />
    );
  }
  function logButtonFor(index: number) {
    return (
      <button
        type="button"
        onClick={() => void logRow(index)}
        aria-label={large ? undefined : `Log set ${index + 1}`}
        className={sizes.logButton}
      >
        {large ? (
          `Log set ${index + 1}`
        ) : (
          <Check className={sizes.icon} strokeWidth={2.25} aria-hidden="true" />
        )}
      </button>
    );
  }
  const repeatButton = lastSet && (
    <button
      type="button"
      onClick={() => void repeatLast()}
      aria-label="Repeat last set"
      className={sizes.repeatButton}
    >
      <RotateCcw className={sizes.icon} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );

  return (
    <section
      className={
        large
          ? "flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          : "flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className={`${sizes.title} flex min-w-0 items-center gap-2`}>
          <span className="min-w-0">{exercise?.name ?? "Exercise"}</span>
          {dpr && (
            <span
              title={dprBadge(dpr.decision.call).label}
              className={`shrink-0 rounded-full border px-1.5 text-xs font-semibold ${dprBadge(dpr.decision.call).className}`}
            >
              {dpr.decision.reason === "Deload week"
                ? "Deload week"
                : `DPR ${dprBadge(dpr.decision.call).symbol}`}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove exercise"
          className={sizes.removeButton}
        >
          <Trash2 className={sizes.icon} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {previous && (
        <p className={sizes.meta}>
          Last time: {previous.weight ?? "—"} × {previous.reps ?? "—"} — the number to beat
        </p>
      )}
      {!previous && target && (
        <p className={sizes.meta}>
          Target: {target.targetSets ?? "—"} × {target.targetRepsLow ?? "—"}–
          {target.targetRepsHigh ?? "—"}
        </p>
      )}

      {dpr && <p className={sizes.meta}>{dprWhyLine(dpr.decision, settings.units)}</p>}

      {suggestedWeights && (
        <div className="flex flex-col gap-1.5">
          <p className={sizes.meta}>Suggested for {suggestionReps} reps, by strength standard:</p>
          <div className="flex flex-wrap gap-1.5">
            {STRENGTH_STANDARD_TIERS.map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => updateDraft(nextIndex, { weight: String(suggestedWeights[tier]) })}
                className="min-h-8 rounded-full border border-zinc-300 px-2.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              >
                {STRENGTH_TIER_LABELS[tier]} {suggestedWeights[tier]}
              </button>
            ))}
          </div>
        </div>
      )}

      {!large && (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className={sizes.headerRow}>
              <th className={`w-8 ${sizes.headerCell}`}>Set</th>
              <th className={`text-center ${sizes.headerCell}`}>Weight</th>
              <th className={`text-center ${sizes.headerCell}`}>Reps</th>
              <th className={`text-center ${sizes.headerCell}`}>
                <RpeInfoMenu titleId={`${fieldId}-rpe-label`} />
              </th>
              <th className={sizes.headerCell} />
            </tr>
          </thead>
          <tbody>
            {sets.map((set, i) => (
              <SetRow
                key={set.id}
                set={set}
                label={rowLabels[i] ?? String(i + 1)}
                isPr={prsBySetId.has(set.id)}
                rpeNudge={needsRpeNudge(dpr !== null, set)}
                onEdit={(patch) => void handleEdit(set, patch)}
                onChangeKind={(kind) => void handleChangeKind(set, kind)}
                onDelete={() => void deleteSet(set)}
              />
            ))}
            {plannedIndices.map((index, i) => {
              const draft = draftFor(index);
              return (
                <tr key={index}>
                  <td className={sizes.indexCell}>
                    <SetKindMenu
                      label={rowLabels[sets.length + i] ?? String(index + 1)}
                      kind={draft.kind}
                      onChange={(kind) => updateDraft(index, { kind })}
                    />
                  </td>
                  <td className={sizes.cell}>{weightInputFor(index, draft)}</td>
                  <td className={sizes.cell}>{repsInputFor(index, draft)}</td>
                  <td className={sizes.cell}>{rpeInputFor(index, draft)}</td>
                  <td className={sizes.actionCell}>
                    <div className="flex min-w-22 items-center justify-end">
                      {index === nextIndex && repeatButton}
                      {logButtonFor(index)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Focus view shows only the entry card, so the set just logged for
          this exercise sits above it (issue #257). It's the compact list-view
          row, which keeps it tappable to edit and fits the no-scroll layout (#148). */}
      {large && lastSet && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Previous set</p>
          <table className="w-full border-collapse text-left">
            <tbody>
              <SetRow
                key={lastSet.id}
                set={lastSet}
                label={rowLabels[sets.length - 1] ?? String(sets.length)}
                isPr={prsBySetId.has(lastSet.id)}
                rpeNudge={needsRpeNudge(dpr !== null, lastSet)}
                onEdit={(patch) => void handleEdit(lastSet, patch)}
                onChangeKind={(kind) => void handleChangeKind(lastSet, kind)}
                onDelete={() => void deleteSet(lastSet)}
              />
            </tbody>
          </table>
        </div>
      )}

      {large && (
        <div className="flex flex-col gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900/60">
          <SetKindMenu
            label={nextLabel}
            kind={nextDraft.kind}
            onChange={(kind) => updateDraft(nextIndex, { kind })}
            large
          />
          <div className="grid grid-cols-3 gap-3">
            <div className={sizes.fieldLabel}>
              <label htmlFor={`${fieldId}-weight`}>Weight</label>
              {weightInputFor(nextIndex, nextDraft)}
            </div>
            <div className={sizes.fieldLabel}>
              <label htmlFor={`${fieldId}-reps`}>Reps</label>
              {repsInputFor(nextIndex, nextDraft)}
            </div>
            <div className={sizes.fieldLabel}>
              <RpeInfoMenu large titleId={`${fieldId}-rpe-label`} />
              {rpeInputFor(nextIndex, nextDraft)}
            </div>
          </div>
          <div className="flex gap-2">
            {logButtonFor(nextIndex)}
            {repeatButton}
          </div>
        </div>
      )}

      {notesOpen ? (
        <label className={sizes.notesLabel}>
          Exercise notes
          <input
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => void handleNotesBlur()}
            className={sizes.notesInput}
          />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          className="self-start text-xs font-medium text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
        >
          + Add note
        </button>
      )}
    </section>
  );
}
