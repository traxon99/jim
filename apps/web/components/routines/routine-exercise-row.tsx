"use client";

import { type ExerciseAction, ExerciseActionsMenu } from "@/components/exercise-actions-menu";
import { ExerciseNameButton } from "@/components/exercises/exercise-name-button";
import { ChevronDown, GripVertical, Plus } from "@/components/icons/solar";
import { NumberStepper } from "@/components/number-stepper";
import { SupersetBadge } from "@/components/supersets/superset-badge";
import type { RoutineExerciseRow as RoutineExerciseRowEntity } from "@/lib/db/schema";
import { routineItemSummary } from "@/lib/routines/summary";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { parseProgressionRule } from "@jim/core";
import { useEffect, useRef, useState } from "react";
import { ProgressionRuleEditor } from "./progression-rule-editor";

interface Props {
  item: RoutineExerciseRowEntity;
  exerciseName: string;
  /** For the exercise card the name opens (issue #796). */
  userId: string;
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
  userId,
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const timedWarmup = warmup?.timed ?? false;
  const summary = routineItemSummary(item, units, timedWarmup || cardio);
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const showNotes = notesOpen || notes.trim() !== "";

  function stepper(
    label: string,
    value: string,
    setValue: (value: string) => void,
    commit: (value: string) => void,
    options: { step: number; decimal?: boolean; unit?: string } = { step: 1 },
  ) {
    return (
      <NumberStepper
        label={label}
        value={value}
        onChange={setValue}
        onCommit={commit}
        step={options.step}
        decimal={options.decimal}
        unit={options.unit}
      />
    );
  }

  const fields = warmup ? (
    <>
      {stepper("Sets", targetSets, setTargetSets, (v) =>
        onUpdate({ targetSets: toNumberOrNull(v) }),
      )}
      {warmup.timed
        ? stepper(
            "Hold (s)",
            durationSeconds,
            setDurationSeconds,
            (v) => onUpdate({ targetDurationSeconds: toNumberOrNull(v) }),
            { step: 5 },
          )
        : stepper("Reps", repsLow, setRepsLow, (v) => {
            const reps = toNumberOrNull(v);
            onUpdate({ targetRepsLow: reps, targetRepsHigh: reps });
          })}
    </>
  ) : cardio ? (
    <>
      {stepper("Sets", targetSets, setTargetSets, (v) =>
        onUpdate({ targetSets: toNumberOrNull(v) }),
      )}
      {stepper(
        "Rest (s)",
        restSeconds,
        setRestSeconds,
        (v) => onUpdate({ targetRestSeconds: toNumberOrNull(v) }),
        { step: 15 },
      )}
      <div className="col-span-2">
        {stepper(
          "Time",
          durationMinutes,
          setDurationMinutes,
          (v) => {
            const minutes = toNumberOrNull(v);
            onUpdate({
              targetDurationSeconds:
                minutes != null && minutes > 0 ? Math.round(minutes * 60) : null,
            });
          },
          { step: 1, decimal: true, unit: "min" },
        )}
      </div>
    </>
  ) : (
    <>
      {stepper("Sets", targetSets, setTargetSets, (v) =>
        onUpdate({ targetSets: toNumberOrNull(v) }),
      )}
      {stepper(
        "Rest (s)",
        restSeconds,
        setRestSeconds,
        (v) => onUpdate({ targetRestSeconds: toNumberOrNull(v) }),
        { step: 15 },
      )}
      {stepper("Reps low", repsLow, setRepsLow, (v) =>
        onUpdate({ targetRepsLow: toNumberOrNull(v) }),
      )}
      {stepper("Reps high", repsHigh, setRepsHigh, (v) =>
        onUpdate({ targetRepsHigh: toNumberOrNull(v) }),
      )}
      <div className="col-span-2">
        {stepper(
          "Weight",
          targetWeight,
          setTargetWeight,
          (v) => onUpdate({ targetWeight: toNumericStringOrNull(v) }),
          { step: units === "kg" ? 2.5 : 5, decimal: true, unit: units },
        )}
      </div>
    </>
  );

  return (
    // One summary line per exercise (#854); tapping it opens the targets in
    // place, each a typeable field with − / + beside it.
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
      className={`flex flex-col ${supersetLabel ? "border-l-4 border-l-accent" : ""} ${
        isDragging ? "relative z-10 opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-1 py-1 pr-1">
        <button
          type="button"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
          className="flex h-11 w-9 shrink-0 touch-none items-center justify-center text-zinc-400 dark:text-zinc-600"
        >
          <GripVertical className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col py-2">
          <span className="flex min-w-0 items-center gap-2">
            {supersetLabel && <SupersetBadge label={supersetLabel} />}
            <ExerciseNameButton
              exerciseId={item.exerciseId}
              userId={userId}
              className="min-w-0 truncate text-left text-base font-medium"
            >
              {exerciseName}
            </ExerciseNameButton>
            {warmup && (
              <span className="shrink-0 text-xs font-medium text-orange-700 dark:text-orange-400">
                Warm-up
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex min-h-8 items-center gap-1 text-left text-sm tabular-nums text-zinc-500 dark:text-zinc-400"
          >
            <span className="min-w-0 truncate">{summary ?? "Set targets"}</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
        </div>
        <ExerciseActionsMenu actions={actions} />
      </div>

      {open && (
        <div className="flex flex-col gap-2 pb-3 pl-10 pr-3">
          <div className="grid grid-cols-2 gap-2">{fields}</div>

          {!warmup && !cardio && (
            <ProgressionRuleEditor
              rule={parseProgressionRule(item.progressionRule)}
              units={units}
              dprFocused={dprFocused}
              onChange={(progressionRule) => onUpdate({ progressionRule })}
            />
          )}

          {showNotes ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Notes
              <input
                type="text"
                value={notes}
                // biome-ignore lint/a11y/noAutofocus: only after tapping Add note
                autoFocus={notesOpen && notes === ""}
                onChange={(event) => setNotes(event.target.value)}
                onBlur={() => onUpdate({ notes: notes.trim() || null })}
                className="rounded-xl bg-zinc-100 px-3 py-2.5 text-base text-zinc-950 outline-none dark:bg-zinc-800/70 dark:text-zinc-50"
              />
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className="flex min-h-11 items-center gap-1 self-start text-sm font-medium text-accent"
            >
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Add note
            </button>
          )}
        </div>
      )}
      {!open && notes.trim() !== "" && (
        <p className="-mt-1 pb-3 pl-10 pr-3 text-sm text-zinc-700 dark:text-zinc-300">{notes}</p>
      )}
    </li>
  );
}
