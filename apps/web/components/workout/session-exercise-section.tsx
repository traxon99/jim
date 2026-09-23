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
import { loadPreviousSetsByIndex } from "@/lib/sessions/previous-set-lookup";
import { completeSet, deleteSet, editSet } from "@/lib/sessions/set-actions";
import { SET_KINDS, type SetKind } from "@/lib/sessions/set-kinds";
import { STRENGTH_TIER_LABELS } from "@/lib/strength-standards/labels";
import { strengthProfileFromSettings } from "@/lib/strength-standards/profile";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type PrCandidate,
  type PreviousSet,
  STRENGTH_STANDARD_TIERS,
  prefillWeightForFirstSet,
  resolveCurrentRows,
  standardLiftForSlug,
  suggestedWeightsByTier,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { SetRow } from "./set-row";

interface Props {
  sessionId: string;
  userId: string;
  item: SessionExerciseRow;
  exercise: ExerciseRow | undefined;
  target: RoutineExerciseRow | undefined;
  settings: SettingsRow;
  large?: boolean;
  onSetLogged: (restSeconds: number) => void;
  onRemove: () => void;
}

function toNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
    input: large
      ? "w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-3 text-lg text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      : "w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50",
    logButton: large
      ? "min-h-14 flex-1 rounded-lg bg-accent px-4 text-lg font-semibold text-accent-foreground"
      : "min-h-11 rounded-md bg-accent px-2 text-xs font-medium text-accent-foreground",
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
  const [kind, setKind] = useState<SetKind>("working");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rpe, setRpe] = useState("");

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

  // Strength-standard weight suggestions (#94): only for the four lifts
  // packages/core has published standards for, and only once sex + bodyweight
  // are on the profile (age is optional — see strengthProfileFromSettings).
  const standardLift = useMemo(() => standardLiftForSlug(exercise?.slug), [exercise?.slug]);
  const strengthProfile = useMemo(() => strengthProfileFromSettings(settings), [settings]);
  const suggestionReps = toNumberOrNull(reps) ?? previous?.reps ?? target?.targetRepsLow ?? 5;
  const suggestedWeights = useMemo(() => {
    if (!standardLift || !strengthProfile) return null;
    return suggestedWeightsByTier(standardLift, strengthProfile, suggestionReps);
  }, [standardLift, strengthProfile, suggestionReps]);

  useEffect(() => {
    setWeight((current) =>
      current === "" ? prefillWeightForFirstSet(nextIndex, previous) : current,
    );
  }, [nextIndex, previous]);

  async function logDraft() {
    const { set, prs } = await completeSet({
      userId,
      sessionExerciseId: item.id,
      exerciseId: item.exerciseId,
      setIndex: nextIndex,
      kind,
      weight: toNumberOrNull(weight),
      reps: toNumberOrNull(reps),
      rpe: toNumberOrNull(rpe),
    });
    if (prs.length > 0) setPrsBySetId((map) => new Map(map).set(set.id, prs));
    setWeight("");
    setReps("");
    setRpe("");
    onSetLogged(restSeconds);
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
    onSetLogged(restSeconds);
  }

  async function handleEdit(
    original: SetRowEntity,
    patch: {
      weight: number | null;
      reps: number | null;
      kind: SetRowEntity["kind"];
      rpe: number | null;
    },
  ) {
    await editSet({ original, ...patch });
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

  const weightInput = (
    <input
      id={`${fieldId}-weight`}
      type="number"
      inputMode="decimal"
      placeholder={previous?.weight?.toString() ?? ""}
      value={weight}
      onChange={(event) => setWeight(event.target.value)}
      className={sizes.input}
    />
  );
  const repsInput = (
    <input
      id={`${fieldId}-reps`}
      type="number"
      inputMode="numeric"
      placeholder={previous?.reps?.toString() ?? target?.targetRepsLow?.toString() ?? ""}
      value={reps}
      onChange={(event) => setReps(event.target.value)}
      className={sizes.input}
    />
  );
  const rpeInput = (
    <input
      id={`${fieldId}-rpe`}
      type="number"
      inputMode="decimal"
      min={1}
      max={10}
      step={0.5}
      placeholder="—"
      value={rpe}
      onChange={(event) => setRpe(event.target.value)}
      className={sizes.input}
    />
  );
  const kindSelect = (
    <select
      id={`${fieldId}-kind`}
      value={kind}
      onChange={(event) => setKind(event.target.value as SetKind)}
      className={sizes.input}
    >
      {SET_KINDS.map((k) => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
    </select>
  );
  const logButton = (
    <button type="button" onClick={() => void logDraft()} className={sizes.logButton}>
      {large ? `Log set ${nextIndex + 1}` : "Log"}
    </button>
  );
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
        <h2 className={sizes.title}>{exercise?.name ?? "Exercise"}</h2>
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

      {suggestedWeights && (
        <div className="flex flex-col gap-1.5">
          <p className={sizes.meta}>Suggested for {suggestionReps} reps, by strength standard:</p>
          <div className="flex flex-wrap gap-1.5">
            {STRENGTH_STANDARD_TIERS.map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setWeight(String(suggestedWeights[tier]))}
                className="min-h-8 rounded-full border border-zinc-300 px-2.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              >
                {STRENGTH_TIER_LABELS[tier]} {suggestedWeights[tier]}
              </button>
            ))}
          </div>
        </div>
      )}

      {(!large || sets.length > 0) && (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className={sizes.headerRow}>
              <th className={`w-8 ${sizes.headerCell}`}>Set</th>
              <th className={sizes.headerCell}>Weight</th>
              <th className={sizes.headerCell}>Reps</th>
              <th className={sizes.headerCell}>RPE</th>
              <th className={sizes.headerCell}>Kind</th>
              <th className={sizes.headerCell} />
            </tr>
          </thead>
          <tbody>
            {sets.map((set, i) => (
              <SetRow
                key={set.id}
                set={set}
                index={i}
                isPr={prsBySetId.has(set.id)}
                large={large}
                onEdit={(patch) => void handleEdit(set, patch)}
                onDelete={() => void deleteSet(set)}
              />
            ))}
            {!large && (
              <tr>
                <td className={sizes.indexCell}>{nextIndex + 1}</td>
                <td className={sizes.cell}>{weightInput}</td>
                <td className={sizes.cell}>{repsInput}</td>
                <td className={sizes.cell}>{rpeInput}</td>
                <td className={sizes.cell}>{kindSelect}</td>
                <td className={sizes.actionCell}>
                  {logButton}
                  {repeatButton}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {large && (
        <div className="flex flex-col gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900/60">
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Set {nextIndex + 1}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className={sizes.fieldLabel}>
              <label htmlFor={`${fieldId}-weight`}>Weight</label>
              {weightInput}
            </div>
            <div className={sizes.fieldLabel}>
              <label htmlFor={`${fieldId}-reps`}>Reps</label>
              {repsInput}
            </div>
            <div className={sizes.fieldLabel}>
              <label htmlFor={`${fieldId}-rpe`}>RPE</label>
              {rpeInput}
            </div>
            <div className={sizes.fieldLabel}>
              <label htmlFor={`${fieldId}-kind`}>Kind</label>
              {kindSelect}
            </div>
          </div>
          <div className="flex gap-2">
            {logButton}
            {repeatButton}
          </div>
        </div>
      )}

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
    </section>
  );
}
