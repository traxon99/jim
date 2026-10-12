import type {
  ExerciseRow,
  PersonalRecordRow,
  SessionExerciseRow,
  SessionRow,
  SetRow,
} from "@/lib/db/schema";
import { buildPersonalRecordEntries } from "@/lib/history/pr-groups";
import {
  type ExerciseCategory,
  deletedSessionExerciseIds,
  exerciseCategoryOf,
  exerciseDisplayName,
  resolveCurrentRows,
} from "@jim/core";
import { type PortalRecordEntry, serializeRecordEntries } from "./records-data";

/** One row of the Exercises section's "Every exercise" table (issue #470). */
export interface PortalExerciseIndexRow {
  id: string;
  name: string;
  category: ExerciseCategory;
  /** Workouts with at least one live set of it. */
  workouts: number;
  lastDoneAt: string;
}

/**
 * Every exercise the user has logged a live set of, warm-ups and cardio
 * included, most recently done first. Sets from deleted workouts, or an
 * exercise removed from one, don't count (issue #200).
 */
export function buildExerciseIndex(
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
    "id" | "sessionExerciseId" | "completedAt" | "supersedesId" | "deletedAt"
  >[],
): PortalExerciseIndexRow[] {
  const deleted = deletedSessionExerciseIds(sessions, sessionExercises);
  const sessionExerciseById = new Map(
    sessionExercises.filter((se) => !deleted.has(se.id)).map((se) => [se.id, se]),
  );
  const byExercise = new Map<string, { sessions: Set<string>; lastDoneAt: number }>();
  for (const set of resolveCurrentRows(sets)) {
    if (set.deletedAt) continue;
    const sessionExercise = sessionExerciseById.get(set.sessionExerciseId);
    if (!sessionExercise) continue;
    const entry = byExercise.get(sessionExercise.exerciseId) ?? {
      sessions: new Set<string>(),
      lastDoneAt: 0,
    };
    entry.sessions.add(sessionExercise.sessionId);
    entry.lastDoneAt = Math.max(entry.lastDoneAt, set.completedAt.getTime());
    byExercise.set(sessionExercise.exerciseId, entry);
  }

  const rows: PortalExerciseIndexRow[] = [];
  for (const exercise of exercises) {
    const entry = byExercise.get(exercise.id);
    if (!entry) continue;
    rows.push({
      id: exercise.id,
      name: exerciseDisplayName(exercise),
      category: exerciseCategoryOf(exercise),
      workouts: entry.sessions.size,
      lastDoneAt: new Date(entry.lastDoneAt).toISOString(),
    });
  }
  return rows.sort((a, b) => b.lastDoneAt.localeCompare(a.lastDoneAt));
}

/** Whether an index row matches the search box: every word, any case. */
export function exerciseMatchesSearch(row: Pick<PortalExerciseIndexRow, "name">, query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const name = row.name.toLowerCase();
  return terms.every((term) => name.includes(term));
}

/** One logged set on the desktop exercise page, serializable. */
export interface PortalExerciseSet {
  id: string;
  sessionId: string;
  completedAt: string;
  kind: SetRow["kind"];
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distance: number | null;
  rpe: number | null;
  restSeconds: number | null;
  restTargetSeconds: number | null;
}

/** What the desktop exercise page (issue #470) shows. */
export interface PortalExerciseDetail {
  exercise: {
    id: string;
    name: string;
    isArchived: boolean;
    category: ExerciseCategory;
    equipment: string | null;
    primaryMuscles: string[];
    secondaryMuscles: string[];
    instructions: string[];
    imageUrls: string[];
    videoUrl: string | null;
    machineBrand: string | null;
    machineModel: string | null;
    pulleyType: ExerciseRow["pulleyType"];
  };
  gymName: string | null;
  /** Every current set, oldest first, warm-up sets included. */
  sets: PortalExerciseSet[];
  /** Every live PR row for the exercise, for its current bests. */
  records: PortalRecordEntry[];
}

/**
 * One exercise in full: its catalog details and every current set logged
 * against it in a live workout, the same sets the phone's exercise page
 * reads (`components/exercises/exercise-detail.tsx`). Null when missing.
 */
export function buildPortalExerciseDetail(
  exercise: ExerciseRow | undefined,
  sessions: readonly SessionRow[],
  sessionExercises: readonly SessionExerciseRow[],
  sets: readonly SetRow[],
  personalRecords: readonly PersonalRecordRow[],
  gym: { name: string; deletedAt: Date | null } | undefined,
): PortalExerciseDetail | null {
  if (!exercise) return null;
  const deleted = deletedSessionExerciseIds(sessions, sessionExercises);
  const sessionIdBySessionExercise = new Map(
    sessionExercises
      .filter((se) => se.exerciseId === exercise.id && !deleted.has(se.id))
      .map((se) => [se.id, se.sessionId]),
  );

  const current: PortalExerciseSet[] = [];
  for (const set of resolveCurrentRows(sets)) {
    if (set.deletedAt) continue;
    const sessionId = sessionIdBySessionExercise.get(set.sessionExerciseId);
    if (!sessionId) continue;
    current.push({
      id: set.id,
      sessionId,
      completedAt: set.completedAt.toISOString(),
      kind: set.kind,
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
      durationSeconds: set.durationSeconds,
      distance: set.distance == null ? null : Number(set.distance),
      rpe: set.rpe == null ? null : Number(set.rpe),
      restSeconds: set.restSeconds ?? null,
      restTargetSeconds: set.restTargetSeconds ?? null,
    });
  }
  current.sort((a, b) => a.completedAt.localeCompare(b.completedAt));

  return {
    exercise: {
      id: exercise.id,
      name: exerciseDisplayName(exercise),
      isArchived: exercise.isArchived,
      category: exerciseCategoryOf(exercise),
      equipment: exercise.equipment,
      primaryMuscles: [...exercise.primaryMuscles],
      secondaryMuscles: [...exercise.secondaryMuscles],
      instructions: [...exercise.instructions],
      imageUrls: [...exercise.imageUrls],
      videoUrl: exercise.videoUrl ?? null,
      machineBrand: exercise.machineBrand ?? null,
      machineModel: exercise.machineModel ?? null,
      pulleyType: exercise.pulleyType ?? null,
    },
    gymName: gym && !gym.deletedAt ? gym.name : null,
    sets: current,
    records: serializeRecordEntries(
      buildPersonalRecordEntries(
        personalRecords.filter((record) => record.exerciseId === exercise.id),
        sessions,
        sessionExercises,
        sets,
        [exercise],
      ),
    ),
  };
}
