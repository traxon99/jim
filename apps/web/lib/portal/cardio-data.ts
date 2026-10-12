import type { ExerciseRow, SessionExerciseRow, SessionRow, SetRow } from "@/lib/db/schema";
import {
  type CardioBests,
  computeCardioBests,
  deletedSessionExerciseIds,
  exerciseCategoryOf,
  exerciseDisplayName,
  resolveCurrentRows,
} from "@jim/core";

/** One logged cardio set, serializable from the server. */
export interface PortalCardioSet {
  exerciseId: string;
  sessionId: string;
  completedAt: string;
  distance: number | null;
  durationSeconds: number | null;
}

/** What the desktop Cardio section (issue #470) shows. */
export interface PortalCardioData {
  units: "lb" | "kg";
  exercises: { id: string; name: string }[];
  sets: PortalCardioSet[];
}

function positive(value: number | null): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Every current set of a cardio exercise in a live workout, oldest first.
 * Cardio is kept apart from the strength and volume numbers (issue #423),
 * so this is the only place the portal reads it.
 */
export function buildPortalCardioData(
  sessions: readonly Pick<SessionRow, "id" | "deletedAt">[],
  sessionExercises: readonly Pick<
    SessionExerciseRow,
    "id" | "sessionId" | "exerciseId" | "deletedAt"
  >[],
  exercises: readonly Pick<
    ExerciseRow,
    "id" | "name" | "category" | "machineBrand" | "machineModel"
  >[],
  sets: readonly Pick<
    SetRow,
    | "id"
    | "sessionExerciseId"
    | "completedAt"
    | "distance"
    | "durationSeconds"
    | "supersedesId"
    | "deletedAt"
  >[],
  units: "lb" | "kg",
): PortalCardioData {
  const cardio = exercises.filter((exercise) => exerciseCategoryOf(exercise) === "cardio");
  const cardioIds = new Set(cardio.map((exercise) => exercise.id));
  const deleted = deletedSessionExerciseIds(sessions, sessionExercises);
  const sessionExerciseById = new Map(
    sessionExercises
      .filter((se) => cardioIds.has(se.exerciseId) && !deleted.has(se.id))
      .map((se) => [se.id, se]),
  );

  const result: PortalCardioSet[] = [];
  for (const set of resolveCurrentRows(sets)) {
    if (set.deletedAt) continue;
    const sessionExercise = sessionExerciseById.get(set.sessionExerciseId);
    if (!sessionExercise) continue;
    const distance = positive(set.distance == null ? null : Number(set.distance));
    const durationSeconds = positive(set.durationSeconds);
    if (distance == null && durationSeconds == null) continue;
    result.push({
      exerciseId: sessionExercise.exerciseId,
      sessionId: sessionExercise.sessionId,
      completedAt: set.completedAt.toISOString(),
      distance,
      durationSeconds,
    });
  }
  result.sort((a, b) => a.completedAt.localeCompare(b.completedAt));

  const used = new Set(result.map((set) => set.exerciseId));
  return {
    units,
    exercises: cardio
      .filter((exercise) => used.has(exercise.id))
      .map((exercise) => ({ id: exercise.id, name: exerciseDisplayName(exercise) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    sets: result,
  };
}

/** One workout's cardio, summed across its sets, for the charts. */
export interface CardioWorkoutPoint {
  sessionId: string;
  at: Date;
  distance: number | null;
  durationSeconds: number | null;
  /** Seconds per distance unit, from the sets that logged both. */
  paceSeconds: number | null;
}

/** Per-workout totals, oldest first, from sets already filtered to show. */
export function cardioWorkoutPoints(sets: readonly PortalCardioSet[]): CardioWorkoutPoint[] {
  const bySession = new Map<
    string,
    { at: Date; distance: number; duration: number; paceDistance: number; paceDuration: number }
  >();
  for (const set of sets) {
    const entry = bySession.get(set.sessionId) ?? {
      at: new Date(set.completedAt),
      distance: 0,
      duration: 0,
      paceDistance: 0,
      paceDuration: 0,
    };
    entry.distance += set.distance ?? 0;
    entry.duration += set.durationSeconds ?? 0;
    if (set.distance != null && set.durationSeconds != null) {
      entry.paceDistance += set.distance;
      entry.paceDuration += set.durationSeconds;
    }
    bySession.set(set.sessionId, entry);
  }
  return [...bySession.entries()]
    .map(([sessionId, entry]) => ({
      sessionId,
      at: entry.at,
      distance: entry.distance > 0 ? entry.distance : null,
      durationSeconds: entry.duration > 0 ? entry.duration : null,
      paceSeconds: entry.paceDistance > 0 ? entry.paceDuration / entry.paceDistance : null,
    }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

export interface CardioSummary {
  workouts: number;
  distance: number;
  durationSeconds: number;
  /** Total time over total distance, from sets that logged both. */
  paceSeconds: number | null;
}

export function summarizeCardio(points: readonly CardioWorkoutPoint[]): CardioSummary {
  let distance = 0;
  let durationSeconds = 0;
  let paceDistance = 0;
  let paceDuration = 0;
  for (const point of points) {
    distance += point.distance ?? 0;
    durationSeconds += point.durationSeconds ?? 0;
    if (point.paceSeconds != null && point.distance != null) {
      // Weight each workout's pace by its distance to recover total time.
      paceDistance += point.distance;
      paceDuration += point.paceSeconds * point.distance;
    }
  }
  return {
    workouts: points.length,
    distance,
    durationSeconds,
    paceSeconds: paceDistance > 0 ? paceDuration / paceDistance : null,
  };
}

/** One row of the cardio records table: an exercise's all-time bests. */
export interface CardioRecordRow {
  exerciseId: string;
  name: string;
  workouts: number;
  lastDoneAt: Date;
  bests: CardioBests;
}

/** Each cardio exercise's records (`computeCardioBests`), most recently done first. */
export function cardioRecordRows(data: PortalCardioData): CardioRecordRow[] {
  return data.exercises
    .map((exercise) => {
      const sets = data.sets.filter((set) => set.exerciseId === exercise.id);
      return {
        exerciseId: exercise.id,
        name: exercise.name,
        workouts: new Set(sets.map((set) => set.sessionId)).size,
        lastDoneAt: new Date(sets[sets.length - 1]?.completedAt ?? 0),
        bests: computeCardioBests(sets),
      };
    })
    .sort((a, b) => b.lastDoneAt.getTime() - a.lastDoneAt.getTime());
}
