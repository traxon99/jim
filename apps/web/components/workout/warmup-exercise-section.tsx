"use client";

import { type ExerciseAction, ExerciseActionsMenu } from "@/components/exercise-actions-menu";
import type { ExerciseRow, RoutineExerciseRow, SessionExerciseRow } from "@/lib/db/schema";
import { db } from "@/lib/db/schema";
import { completeSet, deleteSet } from "@/lib/sessions/set-actions";
import { resolveCurrentRows } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, X } from "lucide-react";
import { useId, useMemo, useState } from "react";

interface Props {
  userId: string;
  item: SessionExerciseRow;
  exercise: ExerciseRow | undefined;
  target: RoutineExerciseRow | undefined;
  large?: boolean;
  /** The ⋯ menu's items (issue #269). */
  actions: readonly ExerciseAction[];
}

function toPositiveIntOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A warm-up/stretch in the active session (issue #59). Warm-ups are only
 * ever sets of reps or sets of a held time, with no weight, RPE or PRs — so
 * this is a much lighter logger than SessionExerciseSection. Logging with
 * the field left empty logs the routine's target, so a planned warm-up is
 * one tap per set.
 */
export function WarmupExerciseSection({
  userId,
  item,
  exercise,
  target,
  large = false,
  actions,
}: Props) {
  const fieldId = useId();
  const [value, setValue] = useState("");
  const [showHowTo, setShowHowTo] = useState(false);

  const rawSets = useLiveQuery(
    () => db.sets.where("sessionExerciseId").equals(item.id).toArray(),
    [item.id],
  );
  const sets = useMemo(
    () =>
      resolveCurrentRows(rawSets ?? [])
        .filter((set) => !set.deletedAt)
        .sort((a, b) => a.setIndex - b.setIndex),
    [rawSets],
  );

  const timed = exercise?.trackingType === "time";
  const targetValue = timed ? target?.targetDurationSeconds : target?.targetRepsLow;
  const targetSets = target?.targetSets ?? null;
  const unit = timed ? "s" : " reps";
  const done = targetSets != null && sets.length >= targetSets;
  const instructions = exercise?.instructions ?? [];

  async function log() {
    const amount = toPositiveIntOrNull(value) ?? targetValue ?? null;
    if (amount == null) return;
    await completeSet({
      userId,
      sessionExerciseId: item.id,
      exerciseId: item.exerciseId,
      setIndex: sets.length,
      kind: "warmup",
      weight: null,
      reps: timed ? null : amount,
      durationSeconds: timed ? amount : null,
    });
    setValue("");
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border bg-white p-3 dark:bg-zinc-950 ${
        done ? "border-orange-300 dark:border-orange-800" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className={large ? "text-2xl font-bold" : "text-base font-semibold"}>
            {exercise?.name ?? "Warm-up"}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            {targetValue != null
              ? `${targetSets ?? 1} × ${targetValue}${unit}`
              : timed
                ? "Hold for time"
                : "Reps"}
            {sets.length > 0 && ` · ${sets.length} done`}
          </p>
        </div>
        <ExerciseActionsMenu actions={actions} large={large} />
      </div>

      {instructions.length > 0 && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowHowTo((open) => !open)}
            aria-expanded={showHowTo}
            className="self-start text-xs font-medium underline underline-offset-4"
          >
            {showHowTo ? "Hide how-to" : "How to"}
          </button>
          {showHowTo && (
            <ol className="list-decimal pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              {instructions.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      {sets.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {sets.map((set, i) => (
            <li
              key={set.id}
              className="flex items-center gap-1 rounded-full bg-orange-100 py-0.5 pl-2.5 text-xs font-medium text-orange-800 dark:bg-orange-950/60 dark:text-orange-300"
            >
              <Check className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              {i + 1}: {timed ? `${set.durationSeconds ?? "—"}s` : `${set.reps ?? "—"} reps`}
              <button
                type="button"
                onClick={() => void deleteSet(set)}
                aria-label={`Delete set ${i + 1}`}
                className="flex h-7 w-7 items-center justify-center rounded-full"
              >
                <X className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <label htmlFor={`${fieldId}-value`} className="sr-only">
          {timed ? "Seconds" : "Reps"}
        </label>
        <input
          id={`${fieldId}-value`}
          type="number"
          inputMode="numeric"
          min={1}
          placeholder={targetValue != null ? String(targetValue) : timed ? "Seconds" : "Reps"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-24 min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <span className="pb-2 text-sm text-zinc-500 dark:text-zinc-500">
          {timed ? "sec" : "reps"}
        </span>
        <button
          type="button"
          onClick={() => void log()}
          disabled={value.trim() === "" && targetValue == null}
          className="ml-auto min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          Log set {sets.length + 1}
        </button>
      </div>
    </div>
  );
}
