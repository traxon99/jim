"use client";

import { CardioSportTile } from "@/components/cardio/cardio-sport";
import { type ExerciseAction, ExerciseActionsMenu } from "@/components/exercise-actions-menu";
import { ExerciseDetail } from "@/components/exercises/exercise-detail";
import { Check, Trophy } from "@/components/icons/solar";
import { UndoBar, useUndoable } from "@/components/undo-bar";
import { type LongPressStart, useLongPress } from "@/components/workout/use-long-press";
import type {
  ExerciseRow,
  RoutineExerciseRow,
  SessionExerciseRow,
  SettingsRow,
} from "@/lib/db/schema";
import { type SetRow, db } from "@/lib/db/schema";
import { alertSetValueError, completeSet, deleteSet, restoreSet } from "@/lib/sessions/set-actions";
import { useLogGuard } from "@/lib/workout/log-guard";
import {
  type CardioRecordBook,
  type CardioRecordId,
  type CardioRecordSet,
  buildCardioRecordBook,
  cardioDistanceUnitLabel,
  cardioDistanceValue,
  cardioInputToDistance,
  cardioKindOf,
  cardioMetricLabel,
  cardioMetricValue,
  cardioProfile,
  cardioRecordLabel,
  cardioRecordOrder,
  cardioStandards,
  deletedSessionExerciseIds,
  distanceToMeters,
  distanceUnitFor,
  durationDigitsText,
  durationFromDigits,
  exerciseDisplayName,
  formatCardioRecordValue,
  formatCardioSetFor,
  formatDuration,
  normalizeDecimalInput,
  resolveCurrentRows,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useId, useMemo, useState } from "react";
import { CardioRecordToast, type CardioRecordToastData } from "./cardio-record-toast";
import { PrBadge } from "./pr-badge";
import { canUnlogSet, sessionSetTableSizes } from "./session-set-ui";

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
  /**
   * Press and hold the exercise name to rearrange the workout (issue #658);
   * the finger is still down when it's called.
   */
  onNameLongPress?: (start: LongPressStart) => void;
}

function toRecordSet(set: SetRow): CardioRecordSet {
  return {
    id: set.id,
    groupId: set.sessionExerciseId,
    completedAt: set.completedAt,
    distance: set.distance,
    durationSeconds: set.durationSeconds,
  };
}

/**
 * The record to beat under the name: the standard distance last time's set
 * ran at ("5K 26:41"), else the best pace, split or speed; for time-only
 * cardio, the longest set or most rounds.
 */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function recordToBeat(
  book: CardioRecordBook,
  kind: ReturnType<typeof cardioKindOf>,
  tracksDistance: boolean,
  lastMeters: number | null,
): CardioRecordId | null {
  if (!tracksDistance) {
    const id = kind === "boxing" ? "rounds" : "duration";
    return book.bests.has(id) ? id : null;
  }
  if (lastMeters != null) {
    const standard = cardioStandards(kind).find(
      (s) => lastMeters >= s.meters * 0.995 && lastMeters <= s.meters * 1.1,
    );
    if (standard && book.bests.has(`std:${standard.id}`)) return `std:${standard.id}`;
  }
  if (book.bests.has("pace")) return "pace";
  return book.bests.has("distance") ? "distance" : null;
}

/**
 * A cardio exercise in the active session (issue #423, redesigned in #872 to
 * match the strength card): a table of sets in the exercise's own units (a
 * run in miles with its pace, a row in meters with its /500m split), logged
 * rows on the green done wash, and the record to beat under the name. A set
 * that beats a record raises a toast. Leaving the boxes empty logs what the
 * placeholders show (this workout's last set, else the routine's target,
 * else last time), so repeating an interval or a round is one tap.
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
  onNameLongPress,
}: Props) {
  const nameLongPress = useLongPress(onNameLongPress);
  const fieldId = useId();
  const sizes = sessionSetTableSizes(large);
  const [distance, setDistance] = useState("");
  const [timeDigits, setTimeDigits] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [toast, setToast] = useState<CardioRecordToastData | null>(null);
  // A deleted set can come back (#520), like a strength set (issue #318).
  const undoableDelete = useUndoable<SetRow>();

  // Tapping a logged row's ✓ unlogs it back into the entry row (#645), and
  // only once it has been logged a moment, so a double tap on Log, which
  // sits in the same column, can't undo itself (#318).
  async function handleUnlog(set: SetRow) {
    if (!canUnlogSet(set.completedAt, new Date())) return;
    setDistance(cardioDistanceValue(set.distance, unit, profile) ?? "");
    setTimeDigits(
      set.durationSeconds
        ? formatDuration(set.durationSeconds).replace(/\D/g, "").replace(/^0+/, "")
        : "",
    );
    undoableDelete.offer("Set unlogged", await deleteSet(set));
  }

  async function handleUndoDelete() {
    const tombstone = undoableDelete.take();
    if (tombstone) await restoreSet(tombstone);
  }

  const unit = distanceUnitFor(settings.units);
  const kind = cardioKindOf(exercise);
  const profile = cardioProfile(kind);
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

  const book = useMemo(
    () => buildCardioRecordBook((history ?? []).map(toRecordSet), kind, unit, tracksDistance),
    [history, kind, unit, tracksDistance],
  );

  // Last time: the last workout's sets of this exercise, before this one.
  const lastTimeSets = useMemo(() => {
    const earlier = (history ?? []).filter((set) => set.sessionExerciseId !== item.id);
    const lastGroup = earlier.at(-1)?.sessionExerciseId;
    return lastGroup ? earlier.filter((set) => set.sessionExerciseId === lastGroup) : [];
  }, [history, item.id]);

  // What an empty box logs: this workout's last set, else the routine's
  // target time, else the last set from an earlier workout.
  const previous = useMemo(() => {
    const lastHere = sets.at(-1);
    if (lastHere) return lastHere;
    if (target?.targetDurationSeconds != null) {
      return { distance: null, durationSeconds: target.targetDurationSeconds };
    }
    return lastTimeSets.at(-1) ?? null;
  }, [sets, target, lastTimeSets]);
  const previousDistance =
    tracksDistance && previous?.distance != null && Number(previous.distance) > 0
      ? Number(previous.distance)
      : null;
  const previousDuration = tracksTime ? (previous?.durationSeconds ?? null) : null;

  const targetSets = target?.targetSets ?? null;
  const restSeconds =
    item.restSeconds ?? target?.targetRestSeconds ?? (Number(settings.defaultRestSeconds) || 90);

  const typedDistanceNumber = distance.trim() === "" ? null : Number(distance);
  const typedDistance =
    typedDistanceNumber != null && Number.isFinite(typedDistanceNumber) && typedDistanceNumber > 0
      ? cardioInputToDistance(typedDistanceNumber, unit, profile)
      : null;
  const typedDuration = durationFromDigits(timeDigits);
  const typedAnything = distance.trim() !== "" || timeDigits !== "";

  const nextDistance = typedAnything ? typedDistance : previousDistance;
  const nextDuration = typedAnything ? typedDuration : previousDuration;
  const canLog = nextDistance != null || nextDuration != null;
  const liveMetric = tracksDistance
    ? cardioMetricValue(nextDuration, nextDistance, unit, profile)
    : null;

  const logGuard = useLogGuard(sets);

  function log() {
    return logGuard.run(save).catch(alertSetValueError);
  }

  async function save() {
    if (!canLog) return;
    const { set: logged } = await completeSet({
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
    setTimeDigits("");
    // Judge the new set against everything before it, as the table will.
    const after = buildCardioRecordBook(
      [...(history ?? []).map(toRecordSet), toRecordSet(logged)],
      kind,
      unit,
      tracksDistance,
    );
    const beaten = after.bySet.get(logged.id);
    // The toast leads with the record the card ranks first (a 5K before pace).
    const headline = beaten ? order.find((id) => beaten.includes(id)) : undefined;
    if (headline) {
      const before = book.bests.get(headline);
      const best = after.bests.get(headline);
      if (best) {
        setToast({
          key: logged.id,
          title: `${cardioRecordLabel(headline, profile)} · ${formatCardioRecordValue(headline, best.value, unit, profile)}`,
          detail: before
            ? `was ${formatCardioRecordValue(headline, before.value, unit, profile)}`
            : null,
          sport: kind,
        });
      }
    }
    const remaining = targetSets == null ? 0 : Math.max(0, targetSets - (sets.length + 1));
    onSetLogged(restSeconds, remaining);
  }

  const lastTexts = lastTimeSets.map((set) => formatCardioSetFor(set, unit, profile));
  const lastLine =
    lastTexts.length === 0
      ? null
      : lastTexts.length > 1 && lastTexts.every((text) => text === lastTexts[0])
        ? `Last ${lastTexts.length} × ${lastTexts[0]}`
        : `Last ${lastTexts.at(-1)}`;
  const lastMeters = previousDistance != null ? distanceToMeters(previousDistance, unit) : null;
  const toBeat = recordToBeat(book, kind, tracksDistance, lastMeters);
  const toBeatEntry = toBeat ? book.bests.get(toBeat) : undefined;
  const toBeatText =
    toBeat && toBeatEntry
      ? toBeat.startsWith("std:")
        ? `${capitalize(cardioRecordLabel(toBeat, profile).replace("Fastest ", ""))} ${formatCardioRecordValue(toBeat, toBeatEntry.value, unit, profile)}`
        : toBeat === "distance"
          ? `Longest ${formatCardioRecordValue(toBeat, toBeatEntry.value, unit, profile)}`
          : formatCardioRecordValue(toBeat, toBeatEntry.value, unit, profile)
      : null;
  // Order the record names in a set's badge label the way the card lists them.
  const order = cardioRecordOrder(kind, tracksDistance);

  const distanceLabel = cardioDistanceUnitLabel(profile, unit);
  const metricLabel = cardioMetricLabel(profile, unit);
  const columns = tracksDistance && tracksTime ? 4 : tracksDistance ? 3 : 2;
  const gridClass =
    columns === 4
      ? "grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_3.75rem_2.75rem]"
      : columns === 3
        ? "grid-cols-[2rem_minmax(0,1fr)_2.75rem]"
        : "grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]";
  const valueText = "text-center text-xl font-semibold tabular-nums";
  const metricText = "text-center text-[15px] font-semibold tabular-nums";
  const nextLabel = sets.length + 1;

  return (
    <section
      className={`surface relative flex flex-col rounded-3xl border border-transparent p-4 ${
        large ? "gap-4" : "gap-3"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className={`${sizes.title} flex min-w-0 items-center gap-2.5`}>
            <CardioSportTile kind={kind} />
            <button
              type="button"
              {...nameLongPress}
              onClick={() => setDetailOpen(true)}
              className="min-w-0 text-left"
            >
              {exerciseDisplayName(exercise)}
            </button>
          </h2>
          {(lastLine || toBeatText) && (
            <p className={`${sizes.meta} flex flex-wrap items-center gap-x-2 tabular-nums`}>
              {lastLine && <span>{lastLine}</span>}
              {toBeatText && (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                  <Trophy className="h-3.5 w-3.5" strokeWidth={2} aria-label="Record" />
                  {toBeatText}
                </span>
              )}
            </p>
          )}
        </div>
        <ExerciseActionsMenu actions={actions} large={large} />
      </div>

      <div>
        <div className={`grid ${gridClass} items-center gap-x-2 px-1 pb-1 ${sizes.headerRow}`}>
          <span className="pl-1">{profile.setLabel}</span>
          {tracksDistance && <span className="text-center">{distanceLabel}</span>}
          {tracksTime && <span className="text-center">Time</span>}
          {tracksDistance && tracksTime && <span className="text-center">{metricLabel}</span>}
          <span />
        </div>

        <div className="flex flex-col gap-1">
          {sets.map((set, i) => {
            const records = book.bySet.get(set.id);
            const metric = cardioMetricValue(set.durationSeconds, set.distance, unit, profile);
            const recordLabel = records
              ? `New best ${[...records]
                  .sort((a, b) => order.indexOf(a) - order.indexOf(b))
                  .map((id) => cardioRecordLabel(id, profile).toLowerCase())
                  .join(", ")}`
              : null;
            const gold = "text-amber-600 dark:text-amber-400";
            return (
              <div
                key={set.id}
                className={`grid ${gridClass} min-h-13 items-center gap-x-2 rounded-2xl bg-done/10 px-1`}
              >
                <span className="pl-1 text-xs font-semibold text-done">{i + 1}</span>
                {tracksDistance && (
                  <span className={`${valueText} ${records?.includes("distance") ? gold : ""}`}>
                    {cardioDistanceValue(set.distance, unit, profile) ?? "—"}
                  </span>
                )}
                {tracksTime && (
                  <span
                    className={`${valueText} ${
                      records?.some((r) => r === "duration" || r.startsWith("std:")) ? gold : ""
                    }`}
                  >
                    {set.durationSeconds ? formatDuration(set.durationSeconds) : "—"}
                    {!tracksDistance && recordLabel && (
                      <PrBadge label={recordLabel} className="ml-1 align-[3px]" />
                    )}
                  </span>
                )}
                {tracksDistance && tracksTime && (
                  <span
                    className={`${metricText} ${records ? gold : "text-zinc-500"} flex items-center justify-center gap-1`}
                  >
                    {metric ?? "—"}
                    {recordLabel && <PrBadge label={recordLabel} />}
                  </span>
                )}
                <span className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleUnlog(set)}
                    aria-label={`Unlog ${profile.setLabel.toLowerCase()} ${i + 1}`}
                    className="press flex h-11 w-11 items-center justify-center rounded-full bg-done text-done-foreground"
                  >
                    <Check className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
                  </button>
                </span>
              </div>
            );
          })}

          <div className={`grid ${gridClass} min-h-13 items-center gap-x-2 px-1`}>
            <span className="pl-1 text-xs font-medium text-zinc-500">{nextLabel}</span>
            {tracksDistance && (
              <span>
                <label htmlFor={`${fieldId}-distance`} className="sr-only">
                  Distance ({distanceLabel})
                </label>
                <input
                  id={`${fieldId}-distance`}
                  type="text"
                  inputMode={profile.meters ? "numeric" : "decimal"}
                  placeholder={
                    previousDistance != null
                      ? (cardioDistanceValue(previousDistance, unit, profile) ?? "")
                      : profile.meters
                        ? "m"
                        : unit
                  }
                  value={distance}
                  onChange={(event) =>
                    setDistance(
                      profile.meters
                        ? event.target.value.replace(/\D/g, "")
                        : normalizeDecimalInput(event.target.value),
                    )
                  }
                  className={`${sizes.input} ${sizes.inputBorder}`}
                />
              </span>
            )}
            {tracksTime && (
              <span>
                <label htmlFor={`${fieldId}-time`} className="sr-only">
                  Time
                </label>
                <input
                  id={`${fieldId}-time`}
                  type="text"
                  inputMode="numeric"
                  placeholder={previousDuration != null ? formatDuration(previousDuration) : "0:00"}
                  value={durationDigitsText(timeDigits)}
                  onChange={(event) => setTimeDigits(event.target.value.replace(/\D/g, ""))}
                  className={`${sizes.input} ${sizes.inputBorder}`}
                />
              </span>
            )}
            {tracksDistance && tracksTime && (
              <span
                aria-live="polite"
                className={`${metricText} ${typedAnything ? "" : "text-zinc-400 dark:text-zinc-500"}`}
              >
                {liveMetric ?? "—"}
              </span>
            )}
            <span className="flex justify-end">
              <button
                type="button"
                onClick={() => void log()}
                disabled={!canLog}
                aria-label={`Log ${profile.setLabel.toLowerCase()} ${nextLabel}`}
                className={`${sizes.logButton} disabled:opacity-40`}
              >
                <Check className={sizes.rowIcon} strokeWidth={2.25} aria-hidden="true" />
              </button>
            </span>
          </div>
        </div>
      </div>

      {undoableDelete.label && (
        <UndoBar label={undoableDelete.label} onUndo={() => void handleUndoDelete()} />
      )}
      {toast && <CardioRecordToast toast={toast} onDone={() => setToast(null)} />}
      {detailOpen && (
        <ExerciseDetail id={item.exerciseId} userId={userId} onClose={() => setDetailOpen(false)} />
      )}
    </section>
  );
}
