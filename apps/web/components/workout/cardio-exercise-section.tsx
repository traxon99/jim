"use client";

import { type ExerciseAction, ExerciseActionsMenu } from "@/components/exercise-actions-menu";
import { ExerciseDetail } from "@/components/exercises/exercise-detail";
import type {
  ExerciseRow,
  RoutineExerciseRow,
  SessionExerciseRow,
  SettingsRow,
} from "@/lib/db/schema";
import { db } from "@/lib/db/schema";
import { completeSet, deleteSet } from "@/lib/sessions/set-actions";
import {
  type CardioRecordKind,
  computeCardioBests,
  deletedSessionExerciseIds,
  detectCardioRecords,
  distanceUnitFor,
  exerciseDisplayName,
  formatCardioSet,
  formatDuration,
  formatPace,
  resolveCurrentRows,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { PrBadge } from "./pr-badge";

interface Props {
  userId: string;
  item: SessionExerciseRow;
  exercise: ExerciseRow;
  target: RoutineExerciseRow | undefined;
  settings: SettingsRow;
  large?: boolean;
  /** The ⋯ menu's items (issue #269). */
  actions: readonly ExerciseAction[];
  onSetLogged: (restSeconds: number, remainingPlannedSets: number) => void;
}

const RECORD_LABELS: Record<CardioRecordKind, string> = {
  distance: "distance",
  duration: "time",
  pace: "pace",
};

function toPositiveNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function toWholeOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const INPUT_CLASS =
  "min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-950 tabular-nums dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

/**
 * A cardio exercise in the active session (issue #423): each set is a
 * stretch of work logged for distance and/or time — a 5 km run, or one
 * 3:00 round on the bag. Like a warm-up it's a light logger with no
 * weight, reps or RPE; leaving the fields empty logs what the placeholders
 * show (this workout's last set, else the routine's target, else last
 * time), so repeating a round is one tap.
 */
export function CardioExerciseSection({
  userId,
  item,
  exercise,
  target,
  settings,
  large = false,
  actions,
  onSetLogged,
}: Props) {
  const fieldId = useId();
  const [distance, setDistance] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [showHowTo, setShowHowTo] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const unit = distanceUnitFor(settings.units);
  const tracksDistance =
    exercise.trackingType === "distance" || exercise.trackingType === "distance_time";
  const tracksTime = exercise.trackingType !== "distance";

  // Every current set of this exercise across workouts, oldest first:
  // records are judged against everything done before each set.
  const history = useLiveQuery(async () => {
    const all = await db.sessionExercises.where("exerciseId").equals(item.exerciseId).toArray();
    const sessions = await db.sessions.bulkGet([...new Set(all.map((se) => se.sessionId))]);
    const deleted = deletedSessionExerciseIds(
      sessions.filter((session) => session != null),
      all,
    );
    const live = all.filter((se) => !deleted.has(se.id));
    if (live.length === 0) return [];
    const sets = await db.sets
      .where("sessionExerciseId")
      .anyOf(live.map((se) => se.id))
      .toArray();
    return resolveCurrentRows(sets)
      .filter((set) => !set.deletedAt)
      .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  }, [item.exerciseId]);

  const sets = useMemo(
    () =>
      (history ?? [])
        .filter((set) => set.sessionExerciseId === item.id)
        .sort((a, b) => a.setIndex - b.setIndex),
    [history, item.id],
  );

  const recordsBySetId = useMemo(() => {
    const map = new Map<string, CardioRecordKind[]>();
    const all = history ?? [];
    for (const set of sets) {
      const prior = computeCardioBests(all.filter((other) => other.completedAt < set.completedAt));
      const kinds = detectCardioRecords(set, prior);
      if (kinds.length > 0) map.set(set.id, kinds);
    }
    return map;
  }, [history, sets]);

  // What an empty field logs: this workout's last set, else the routine's
  // target time, else the last set from an earlier workout.
  const previous = useMemo(() => {
    const lastHere = sets.at(-1);
    if (lastHere) return lastHere;
    if (target?.targetDurationSeconds != null) {
      return { distance: null, durationSeconds: target.targetDurationSeconds };
    }
    return (history ?? []).filter((set) => set.sessionExerciseId !== item.id).at(-1) ?? null;
  }, [sets, target, history, item.id]);
  const previousDistance =
    tracksDistance && previous?.distance != null ? Number(previous.distance) : null;
  const previousDuration = tracksTime ? (previous?.durationSeconds ?? null) : null;

  const targetSets = target?.targetSets ?? null;
  const done = targetSets != null && sets.length >= targetSets;
  const restSeconds =
    item.restSeconds ?? target?.targetRestSeconds ?? (Number(settings.defaultRestSeconds) || 90);
  const instructions = exercise.instructions ?? [];

  const typedDistance = toPositiveNumberOrNull(distance);
  const typedMinutes = toWholeOrNull(minutes);
  const typedSeconds = toWholeOrNull(seconds);
  const typedAnything = distance.trim() !== "" || minutes.trim() !== "" || seconds.trim() !== "";
  const typedDuration =
    typedMinutes == null && typedSeconds == null
      ? null
      : (typedMinutes ?? 0) * 60 + Math.min(typedSeconds ?? 0, 59);

  const nextDistance = typedAnything ? typedDistance : previousDistance;
  const nextDuration = typedAnything ? typedDuration || null : previousDuration;
  const canLog = nextDistance != null || nextDuration != null;

  async function log() {
    if (!canLog) return;
    await completeSet({
      userId,
      sessionExerciseId: item.id,
      exerciseId: item.exerciseId,
      setIndex: sets.length,
      kind: "working",
      weight: null,
      reps: null,
      distance: tracksDistance ? nextDistance : null,
      durationSeconds: tracksTime ? nextDuration : null,
    });
    setDistance("");
    setMinutes("");
    setSeconds("");
    const remaining = targetSets == null ? 0 : Math.max(0, targetSets - (sets.length + 1));
    onSetLogged(restSeconds, remaining);
  }

  const targetLine =
    target?.targetDurationSeconds != null
      ? `${targetSets ?? 1} × ${formatDuration(target.targetDurationSeconds)}`
      : targetSets != null
        ? `${targetSets} ${targetSets === 1 ? "set" : "sets"}`
        : tracksDistance && tracksTime
          ? "Distance and time"
          : tracksDistance
            ? "Distance"
            : "Time";
  const latest = sets.at(-1);
  const latestPace = latest
    ? formatPace(
        latest.durationSeconds,
        latest.distance == null ? null : Number(latest.distance),
        unit,
      )
    : null;

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border bg-white p-3 dark:bg-zinc-950 ${
        done ? "border-orange-300 dark:border-orange-800" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className={large ? "text-2xl font-bold" : "text-base font-semibold"}>
            <button type="button" onClick={() => setDetailOpen(true)} className="text-left">
              {exerciseDisplayName(exercise)}
            </button>
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Cardio · {targetLine}
            {sets.length > 0 && ` · ${sets.length} done`}
            {latestPace && ` · ${latestPace}`}
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
          {sets.map((set, i) => {
            const records = recordsBySetId.get(set.id);
            return (
              <li
                key={set.id}
                className="flex min-w-0 items-center gap-1 rounded-full bg-orange-100 py-0.5 pl-2.5 text-xs font-medium text-orange-800 dark:bg-orange-950/60 dark:text-orange-300"
              >
                <Check className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
                <span className="truncate">
                  {i + 1}: {formatCardioSet(set, unit)}
                  {records && (
                    <PrBadge
                      label={`New best ${records.map((k) => RECORD_LABELS[k]).join(", ")}`}
                      className="ml-1 align-[1px]"
                    />
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => void deleteSet(set)}
                  aria-label={`Delete set ${i + 1}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                >
                  <X className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        {tracksDistance && (
          <div className="flex items-end gap-1">
            <label htmlFor={`${fieldId}-distance`} className="sr-only">
              Distance ({unit})
            </label>
            <input
              id={`${fieldId}-distance`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder={previousDistance != null ? String(previousDistance) : "0.0"}
              value={distance}
              onChange={(event) => setDistance(event.target.value)}
              className={`${INPUT_CLASS} w-20`}
            />
            <span className="pb-2 text-sm text-zinc-500 dark:text-zinc-500">{unit}</span>
          </div>
        )}
        {tracksTime && (
          <div className="flex items-end gap-1">
            <label htmlFor={`${fieldId}-minutes`} className="sr-only">
              Minutes
            </label>
            <input
              id={`${fieldId}-minutes`}
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={
                previousDuration != null ? String(Math.floor(previousDuration / 60)) : "min"
              }
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              className={`${INPUT_CLASS} w-16`}
            />
            <span className="pb-2 text-sm text-zinc-500 dark:text-zinc-500">:</span>
            <label htmlFor={`${fieldId}-seconds`} className="sr-only">
              Seconds
            </label>
            <input
              id={`${fieldId}-seconds`}
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              placeholder={
                previousDuration != null ? String(previousDuration % 60).padStart(2, "0") : "sec"
              }
              value={seconds}
              onChange={(event) => setSeconds(event.target.value)}
              className={`${INPUT_CLASS} w-16`}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => void log()}
          disabled={!canLog}
          className="ml-auto min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          Log set {sets.length + 1}
        </button>
      </div>
      {detailOpen && (
        <ExerciseDetail id={item.exerciseId} userId={userId} onClose={() => setDetailOpen(false)} />
      )}
    </div>
  );
}
