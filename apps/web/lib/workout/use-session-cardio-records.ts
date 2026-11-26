import { type ExerciseRow, type SessionExerciseRow, type SetRow, db } from "@/lib/db/schema";
import {
  type CardioKind,
  type CardioRecordId,
  type CardioRecordSet,
  type DistanceUnit,
  buildCardioRecordBook,
  cardioKindOf,
  cardioProfile,
  cardioRecordLabel,
  cardioRecordOrder,
  deletedSessionExerciseIds,
  exerciseDisplayName,
  formatCardioRecordValue,
  isCardioExercise,
  resolveCurrentRows,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";

export interface SessionCardioRecord {
  key: string;
  exerciseId: string;
  exerciseName: string;
  kind: CardioKind;
  recordId: CardioRecordId;
  /** "Fastest 5K". */
  label: string;
  /** "26:05". */
  value: string;
  /** The record it beat, "26:41". */
  previous: string | null;
}

/** At most this many records per exercise in the Highlights card. */
const PER_EXERCISE = 2;

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
 * The cardio records a finished workout set (issue #872), for the
 * post-workout Highlights card. Cardio records aren't stored (they're
 * derived from every set of the exercise), so this reads each cardio
 * exercise's whole history from Dexie and keeps the records this workout's
 * sets beat: standard distances first, then the longest and fastest.
 */
export function useSessionCardioRecords(
  sessionExercises: readonly SessionExerciseRow[],
  exercises: readonly ExerciseRow[] | undefined,
  unit: DistanceUnit,
): SessionCardioRecord[] | undefined {
  return useLiveQuery(async () => {
    if (!exercises) return undefined;
    const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const cardioItems = sessionExercises.filter((item) => {
      const exercise = exerciseById.get(item.exerciseId);
      return exercise && isCardioExercise(exercise) && !item.deletedAt;
    });
    const records: SessionCardioRecord[] = [];
    for (const exerciseId of new Set(cardioItems.map((item) => item.exerciseId))) {
      const exercise = exerciseById.get(exerciseId);
      if (!exercise) continue;
      const here = new Set(
        cardioItems.filter((item) => item.exerciseId === exerciseId).map((item) => item.id),
      );
      const all = await db.sessionExercises.where("exerciseId").equals(exerciseId).toArray();
      const sessions = await db.sessions.bulkGet([...new Set(all.map((se) => se.sessionId))]);
      const deleted = deletedSessionExerciseIds(
        sessions.filter((session) => session != null),
        all,
      );
      const live = all.filter((se) => !deleted.has(se.id));
      const sets = resolveCurrentRows(
        await db.sets
          .where("sessionExerciseId")
          .anyOf(live.map((se) => se.id))
          .toArray(),
      ).filter((set) => !set.deletedAt);

      const kind = cardioKindOf(exercise);
      const profile = cardioProfile(kind);
      const tracksDistance =
        exercise.trackingType === "distance" || exercise.trackingType === "distance_time";
      const full = buildCardioRecordBook(sets.map(toRecordSet), kind, unit, tracksDistance);
      const before = buildCardioRecordBook(
        sets.filter((set) => !here.has(set.sessionExerciseId)).map(toRecordSet),
        kind,
        unit,
        tracksDistance,
      );
      const beaten = new Set<CardioRecordId>();
      for (const set of sets) {
        if (!here.has(set.sessionExerciseId)) continue;
        for (const id of full.bySet.get(set.id) ?? []) beaten.add(id);
      }
      const shown = cardioRecordOrder(kind, tracksDistance)
        .filter((id) => beaten.has(id) && full.bests.get(id))
        .slice(0, PER_EXERCISE);
      for (const id of shown) {
        const best = full.bests.get(id);
        if (!best) continue;
        const previous = before.bests.get(id);
        records.push({
          key: `${exerciseId}:${id}`,
          exerciseId,
          exerciseName: exerciseDisplayName(exercise),
          kind,
          recordId: id,
          label: cardioRecordLabel(id, profile),
          value: formatCardioRecordValue(id, best.value, unit, profile),
          previous: previous ? formatCardioRecordValue(id, previous.value, unit, profile) : null,
        });
      }
    }
    return records;
  }, [sessionExercises, exercises, unit]);
}
