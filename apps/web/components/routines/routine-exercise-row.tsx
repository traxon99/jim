"use client";

import { type ExerciseAction, ExerciseActionsMenu } from "@/components/exercise-actions-menu";
import { SupersetBadge } from "@/components/supersets/superset-badge";
import type { RoutineExerciseRow as RoutineExerciseRowEntity } from "@/lib/db/schema";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { parseProgressionRule } from "@jim/core";
import { useEffect, useRef, useState } from "react";
import { ProgressionRuleEditor } from "./progression-rule-editor";

interface Props {
  item: RoutineExerciseRowEntity;
  exerciseName: string;
  /** Warm-ups (issue #59) only take sets plus reps or a hold time. */
  warmup?: { timed: boolean } | null;
  /** Cardio (issue #423) takes sets, a time per set and rest; no reps, weight or progression. */
  cardio?: boolean;
  units: "lb" | "kg";
  /** "A1"-style place in a superset (issue #228), or null. */
  supersetLabel?: string | null;
  /** DPR is focusing on this lift, which rules out a custom progression rule (issue #255). */
  dprFocused?: boolean;
  /** The ⋯ menu's items — superset options and Remove (issue #269). */
  actions: readonly ExerciseAction[];
  onUpdate: (patch: Partial<RoutineExerciseRowEntity>) => void;
}

function toNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Postgres numeric columns round-trip as fixed-scale strings ("135.00"). */
function formatNumericField(value: string | null): string {
  if (value == null) return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function toNumericStringOrNull(value: string): string | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : null;
}

function minutesText(seconds: number | null): string {
  return seconds == null ? "" : String(Number((seconds / 60).toFixed(2)));
}

/** "135.00" from Postgres and "135" typed here are the same target weight. */
function sameValue(current: unknown, next: unknown): boolean {
  if (current === next) return true;
  if (typeof current === "string" && typeof next === "string") {
    return current.trim() !== "" && Number(current) === Number(next);
  }
  return false;
}

/**
 * The fields of `patch` that differ from `item` (issue #519): leaving a
 * field without changing it must not write, or a stale value from before
 * another device's edit would win last-write-wins as the newest change.
 */
export function changedFields(
  item: RoutineExerciseRowEntity,
  patch: Partial<RoutineExerciseRowEntity>,
): Partial<RoutineExerciseRowEntity> | null {
  const changed = Object.fromEntries(
    Object.entries(patch).filter(
      ([key, value]) => !sameValue(item[key as keyof RoutineExerciseRowEntity], value),
    ),
  ) as Partial<RoutineExerciseRowEntity>;
  return Object.keys(changed).length > 0 ? changed : null;
}

export function RoutineExerciseRow({
  item,
  exerciseName,
  warmup = null,
  cardio = false,
  units,
  supersetLabel = null,
  dprFocused = false,
  actions,
  onUpdate: writeUpdate,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const [targetSets, setTargetSets] = useState(item.targetSets?.toString() ?? "");
  const [repsLow, setRepsLow] = useState(item.targetRepsLow?.toString() ?? "");
  const [repsHigh, setRepsHigh] = useState(item.targetRepsHigh?.toString() ?? "");
  const [durationSeconds, setDurationSeconds] = useState(
    item.targetDurationSeconds?.toString() ?? "",
  );
  const [durationMinutes, setDurationMinutes] = useState(minutesText(item.targetDurationSeconds));
  const [restSeconds, setRestSeconds] = useState(item.targetRestSeconds?.toString() ?? "");
  const [targetWeight, setTargetWeight] = useState(formatNumericField(item.targetWeight));
  const [notes, setNotes] = useState(item.notes ?? "");

  // Pick up edits from another device or the MCP (issue #519), except while
  // the user is in one of this row's fields, so a sync can't replace what
  // they're typing.
  const editing = useRef(false);
  useEffect(() => {
    if (editing.current) return;
    setTargetSets(item.targetSets?.toString() ?? "");
    setRepsLow(item.targetRepsLow?.toString() ?? "");
    setRepsHigh(item.targetRepsHigh?.toString() ?? "");
    setDurationSeconds(item.targetDurationSeconds?.toString() ?? "");
    setDurationMinutes(minutesText(item.targetDurationSeconds));
    setRestSeconds(item.targetRestSeconds?.toString() ?? "");
    setTargetWeight(formatNumericField(item.targetWeight));
    setNotes(item.notes ?? "");
  }, [item]);

  function onUpdate(patch: Partial<RoutineExerciseRowEntity>) {
    const changed = changedFields(item, patch);
    if (changed) writeUpdate(changed);
  }

  // The starting weight for an exercise with no history yet — DPR (issue
  // #217) replaced the weekly auto-increment that used to build on it.
  function commitTargetWeight() {
    onUpdate({ targetWeight: toNumericStringOrNull(targetWeight) });
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      onFocus={() => {
        editing.current = true;
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          editing.current = false;
        }
      }}
      className={`flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 ${
        supersetLabel ? "border-l-4 border-l-accent" : ""
      } ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <button
            type="button"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
            className="mt-0.5 -ml-3 flex h-11 w-11 shrink-0 touch-none items-center justify-center text-zinc-400 dark:text-zinc-600"
          >
            ⠿
          </button>
          <span className="flex flex-col pt-2">
            <span className="flex items-center gap-2">
              {supersetLabel && <SupersetBadge label={supersetLabel} />}
              <span className="text-base font-medium">{exerciseName}</span>
            </span>
            {warmup && (
              <span className="text-xs font-medium text-orange-700 dark:text-orange-400">
                Warm-up
              </span>
            )}
            {cardio && (
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500">Cardio</span>
            )}
          </span>
        </div>
        <ExerciseActionsMenu actions={actions} />
      </div>

      <div className="flex flex-wrap gap-2 pl-10">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Sets
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={targetSets}
            onChange={(event) => setTargetSets(event.target.value)}
            onBlur={() => onUpdate({ targetSets: toNumberOrNull(targetSets) })}
            className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        {warmup ? (
          warmup.timed ? (
            <label className="flex flex-col gap-1 text-xs font-medium">
              Hold (s)
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={durationSeconds}
                onChange={(event) => setDurationSeconds(event.target.value)}
                onBlur={() => onUpdate({ targetDurationSeconds: toNumberOrNull(durationSeconds) })}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-xs font-medium">
              Reps
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={repsLow}
                onChange={(event) => setRepsLow(event.target.value)}
                onBlur={() => {
                  const reps = toNumberOrNull(repsLow);
                  onUpdate({ targetRepsLow: reps, targetRepsHigh: reps });
                }}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
          )
        ) : cardio ? (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Time (min)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                onBlur={() => {
                  const minutes = toNumberOrNull(durationMinutes);
                  onUpdate({
                    targetDurationSeconds:
                      minutes != null && minutes > 0 ? Math.round(minutes * 60) : null,
                  });
                }}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Rest (s)
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={restSeconds}
                onChange={(event) => setRestSeconds(event.target.value)}
                onBlur={() => onUpdate({ targetRestSeconds: toNumberOrNull(restSeconds) })}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Reps low
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={repsLow}
                onChange={(event) => setRepsLow(event.target.value)}
                onBlur={() => onUpdate({ targetRepsLow: toNumberOrNull(repsLow) })}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Reps high
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={repsHigh}
                onChange={(event) => setRepsHigh(event.target.value)}
                onBlur={() => onUpdate({ targetRepsHigh: toNumberOrNull(repsHigh) })}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Rest (s)
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={restSeconds}
                onChange={(event) => setRestSeconds(event.target.value)}
                onBlur={() => onUpdate({ targetRestSeconds: toNumberOrNull(restSeconds) })}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Weight ({units})
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={targetWeight}
                onChange={(event) => setTargetWeight(event.target.value)}
                onBlur={commitTargetWeight}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
          </>
        )}
      </div>

      {!warmup && !cardio && (
        <ProgressionRuleEditor
          rule={parseProgressionRule(item.progressionRule)}
          units={units}
          dprFocused={dprFocused}
          onChange={(progressionRule) => onUpdate({ progressionRule })}
        />
      )}

      <label className="flex flex-col gap-1 pl-10 text-xs font-medium">
        Notes
        <input
          type="text"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => onUpdate({ notes: notes.trim() || null })}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>
    </li>
  );
}
