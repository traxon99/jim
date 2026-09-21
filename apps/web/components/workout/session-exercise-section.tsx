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
import { getDeviceId } from "@/lib/sync/engine";
import { type PrCandidate, type PreviousSet, resolveCurrentRows } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { SetRow } from "./set-row";

interface Props {
  sessionId: string;
  userId: string;
  item: SessionExerciseRow;
  exercise: ExerciseRow | undefined;
  target: RoutineExerciseRow | undefined;
  settings: SettingsRow;
  onSetLogged: (restSeconds: number) => void;
  onRemove: () => void;
}

function toNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function SessionExerciseSection({
  sessionId,
  userId,
  item,
  exercise,
  target,
  settings,
  onSetLogged,
  onRemove,
}: Props) {
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

  async function logDraft() {
    const { set, prs } = await completeSet({
      userId,
      sessionExerciseId: item.id,
      exerciseId: item.exerciseId,
      setIndex: nextIndex,
      kind,
      weight: toNumberOrNull(weight),
      reps: toNumberOrNull(reps),
    });
    if (prs.length > 0) setPrsBySetId((map) => new Map(map).set(set.id, prs));
    setWeight("");
    setReps("");
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
    });
    if (prs.length > 0) setPrsBySetId((map) => new Map(map).set(set.id, prs));
    onSetLogged(restSeconds);
  }

  async function handleEdit(
    original: SetRowEntity,
    patch: { weight: number | null; reps: number | null; kind: SetRowEntity["kind"] },
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

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">{exercise?.name ?? "Exercise"}</h2>
        <button
          type="button"
          onClick={onRemove}
          className="min-h-11 px-1 text-xs font-medium text-red-600 dark:text-red-500"
        >
          Remove
        </button>
      </div>

      {sets.length > 0 && (
        <ul className="flex flex-col gap-2">
          {sets.map((set, i) => (
            <SetRow
              key={set.id}
              set={set}
              index={i}
              equipment={exercise?.equipment ?? null}
              settings={settings}
              isPr={prsBySetId.has(set.id)}
              onEdit={(patch) => void handleEdit(set, patch)}
              onDelete={() => void deleteSet(set)}
            />
          ))}
        </ul>
      )}

      {previous && (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Last time: {previous.weight ?? "—"} × {previous.reps ?? "—"} — the number to beat
        </p>
      )}
      {!previous && target && (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Target: {target.targetSets ?? "—"} × {target.targetRepsLow ?? "—"}–
          {target.targetRepsHigh ?? "—"}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Weight
          <input
            type="number"
            inputMode="decimal"
            placeholder={previous?.weight?.toString() ?? ""}
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Reps
          <input
            type="number"
            inputMode="numeric"
            placeholder={previous?.reps?.toString() ?? target?.targetRepsLow?.toString() ?? ""}
            value={reps}
            onChange={(event) => setReps(event.target.value)}
            className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Kind
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as SetKind)}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
          onClick={() => void logDraft()}
          className="min-h-11 rounded-lg bg-zinc-950 px-4 text-sm font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
        >
          Log set
        </button>
        {lastSet && (
          <button
            type="button"
            onClick={() => void repeatLast()}
            className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm font-medium dark:border-zinc-700"
          >
            Repeat last
          </button>
        )}
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium">
        Exercise notes
        <input
          type="text"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => void handleNotesBlur()}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>
    </section>
  );
}
