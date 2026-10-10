import {
  type ExerciseCategory,
  exerciseDisplayName,
  isStrengthExercise,
  resolveCurrentRows,
} from "@jim/core";

interface PortalSessionRow {
  id: string;
  deletedAt: Date | null;
}

interface PortalSessionExerciseRow {
  id: string;
  sessionId: string;
  exerciseId: string;
  deletedAt: Date | null;
}

interface PortalSetRow {
  id: string;
  sessionExerciseId: string;
  kind: string;
  weight: string | null;
  reps: number | null;
  completedAt: Date;
  supersedesId: string | null;
  deletedAt: Date | null;
}

interface PortalExerciseRow {
  id: string;
  name: string;
  category?: ExerciseCategory | null;
  machineBrand?: string | null;
  machineModel?: string | null;
}

/**
 * A set as it crosses from the server component to the client dashboard:
 * dates as ISO strings (plain JSON), weight already numeric.
 */
export interface PortalSet {
  exerciseId: string;
  sessionId: string;
  completedAt: string;
  weight: number | null;
  reps: number | null;
}

export interface PortalExercise {
  id: string;
  name: string;
}

/** Everything the portal dashboard renders, serializable across the server/client boundary. */
export interface PortalData {
  email: string;
  units: "lb" | "kg";
  weekStart: number;
  sets: PortalSet[];
  exercises: PortalExercise[];
}

/**
 * Joins the server's raw rows into the web portal's (issue #38) flat list
 * of working sets — the same read pipeline the phone's history views use
 * (resolve supersede chains, drop tombstones), just from Postgres instead
 * of IndexedDB. Warm-up sets and warm-up exercises are left out: the
 * portal is about working strength and training load (issue #59 made the
 * same call for volume-by-muscle).
 */
export function buildPortalSets(
  sessions: readonly PortalSessionRow[],
  sessionExercises: readonly PortalSessionExerciseRow[],
  exercises: readonly PortalExerciseRow[],
  sets: readonly PortalSetRow[],
): { sets: PortalSet[]; exercises: PortalExercise[] } {
  const liveSessionIds = new Set(
    sessions.filter((session) => !session.deletedAt).map((session) => session.id),
  );
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const sessionExerciseById = new Map(
    sessionExercises
      .filter((se) => !se.deletedAt && liveSessionIds.has(se.sessionId))
      .map((se) => [se.id, se]),
  );

  const result: PortalSet[] = [];
  const usedExerciseIds = new Set<string>();
  for (const set of resolveCurrentRows(sets)) {
    if (set.deletedAt || set.kind === "warmup") continue;
    const sessionExercise = sessionExerciseById.get(set.sessionExerciseId);
    if (!sessionExercise) continue;
    const exercise = exerciseById.get(sessionExercise.exerciseId);
    if (!exercise || !isStrengthExercise(exercise)) continue;

    usedExerciseIds.add(exercise.id);
    result.push({
      exerciseId: exercise.id,
      sessionId: sessionExercise.sessionId,
      completedAt: set.completedAt.toISOString(),
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
    });
  }

  return {
    sets: result,
    exercises: exercises
      .filter((exercise) => usedExerciseIds.has(exercise.id))
      .map((exercise) => ({ id: exercise.id, name: exerciseDisplayName(exercise) })),
  };
}
