import type {
  ExerciseRow,
  PersonalRecordRow,
  SessionExerciseRow,
  SessionRow,
  SetRow,
} from "@/lib/db/schema";
import {
  type SessionDetailExercise,
  type SessionDetailSet,
  buildSessionDetailExercises,
} from "@/lib/history/session-detail-entries";
import { buildSessionListEntries } from "@/lib/history/session-list-entries";
import {
  deriveUntitledSessionName,
  exerciseDisplayName,
  resolveCurrentRows,
  summarizeSession,
  supersetLabels,
} from "@jim/core";

type GymRow = { id: string; name: string; deletedAt: Date | null };

/** The name of a session's gym, treating a deleted gym as none (issue #454). */
function gymNames(gyms: readonly GymRow[]): Map<string, string> {
  return new Map(gyms.filter((gym) => !gym.deletedAt).map((gym) => [gym.id, gym.name]));
}

/**
 * One row of the desktop Workouts table (issue #470), serializable across
 * the server/client boundary. The numbers come from the same
 * `buildSessionListEntries` the phone's History list uses.
 */
export interface PortalWorkoutRow {
  id: string;
  name: string;
  startedAt: string;
  durationSeconds: number;
  gymName: string | null;
  setCount: number;
  totalVolume: number;
  prCount: number;
  /** For search: every exercise done in the workout, in order. */
  exerciseNames: string[];
}

/** Every finished workout, newest first, as History lists them. */
export function buildPortalWorkoutRows(
  sessions: readonly SessionRow[],
  sessionExercises: readonly SessionExerciseRow[],
  exercises: readonly ExerciseRow[],
  sets: readonly SetRow[],
  personalRecords: readonly PersonalRecordRow[],
  gyms: readonly GymRow[],
): PortalWorkoutRow[] {
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const gymName = gymNames(gyms);
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const exerciseNamesBySession = new Map<string, string[]>();
  for (const sessionExercise of [...sessionExercises].sort((a, b) => a.position - b.position)) {
    if (sessionExercise.deletedAt) continue;
    const exercise = exerciseById.get(sessionExercise.exerciseId);
    if (!exercise) continue;
    const list = exerciseNamesBySession.get(sessionExercise.sessionId) ?? [];
    list.push(exerciseDisplayName(exercise));
    exerciseNamesBySession.set(sessionExercise.sessionId, list);
  }

  return buildSessionListEntries(sessions, sessionExercises, exercises, sets, personalRecords)
    .map((entry) => {
      const session = sessionById.get(entry.id);
      const endedAt = entry.endedAt ?? entry.startedAt;
      return {
        id: entry.id,
        name: entry.name ?? "Workout",
        startedAt: entry.startedAt.toISOString(),
        durationSeconds: Math.max(
          0,
          Math.round((endedAt.getTime() - entry.startedAt.getTime()) / 1000),
        ),
        gymName: (session?.gymId && gymName.get(session.gymId)) || null,
        setCount: entry.setCount,
        totalVolume: entry.totalVolume,
        prCount: entry.prCount,
        exerciseNames: exerciseNamesBySession.get(entry.id) ?? [],
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Whether a workout matches the search box: its name, gym or any exercise in it. */
export function workoutMatchesSearch(row: PortalWorkoutRow, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [row.name, row.gymName ?? "", ...row.exerciseNames].join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export interface PortalDetailSet extends SessionDetailSet {
  rpe: number | null;
}

export interface PortalDetailExercise extends Omit<SessionDetailExercise, "sets"> {
  /** "A1", "A2", … when the exercise is part of a superset (issue #228). */
  supersetLabel: string | null;
  sets: PortalDetailSet[];
}

/** One workout in full for the desktop workout page (issue #470). */
export interface PortalWorkoutDetail {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  gymName: string | null;
  durationSeconds: number;
  totalVolume: number;
  setCount: number;
  prCount: number;
  exercises: PortalDetailExercise[];
}

/**
 * A workout as the phone's workout screen shows it (`SessionDetail`): every
 * current set including warm-ups, with set kinds, rest and PRs, plus each
 * set's RPE and the workout's supersets. Null for a missing or deleted
 * workout.
 */
export function buildPortalWorkoutDetail(
  session: SessionRow | undefined,
  sessionExercises: readonly SessionExerciseRow[],
  exercises: readonly ExerciseRow[],
  sets: readonly SetRow[],
  personalRecords: readonly PersonalRecordRow[],
  gyms: readonly GymRow[],
): PortalWorkoutDetail | null {
  if (!session || session.deletedAt) return null;
  const groups = buildSessionDetailExercises(
    session.id,
    sessionExercises,
    exercises,
    sets,
    personalRecords,
  );

  const rpeBySetId = new Map(
    sets.map((set) => [set.id, set.rpe == null ? null : Number(set.rpe)] as const),
  );
  const ordered = sessionExercises
    .filter((se) => se.sessionId === session.id && !se.deletedAt)
    .sort((a, b) => a.position - b.position);
  const labels = supersetLabels(ordered);

  const current = resolveCurrentRows(sets).filter((set) => !set.deletedAt);
  const liveIds = new Set(ordered.map((se) => se.id));
  const sessionSets = current.filter((set) => liveIds.has(set.sessionExerciseId));
  const prCount = groups.reduce(
    (count, group) => count + group.sets.reduce((n, set) => n + set.prKinds.length, 0),
    0,
  );
  const summary = summarizeSession(
    sessionSets.map((set) => ({
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
      kind: set.kind,
    })),
    session.startedAt,
    session.endedAt ?? session.startedAt,
    prCount,
  );

  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const exerciseIdBySessionExercise = new Map(ordered.map((se) => [se.id, se.exerciseId]));
  const name =
    session.name ??
    deriveUntitledSessionName(
      session.startedAt,
      sessionSets.map((set) => ({
        primaryMuscles:
          exerciseById.get(exerciseIdBySessionExercise.get(set.sessionExerciseId) ?? "")
            ?.primaryMuscles ?? [],
      })),
    );

  return {
    id: session.id,
    name,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    notes: session.notes,
    gymName: (session.gymId && gymNames(gyms).get(session.gymId)) || null,
    durationSeconds: summary.durationSeconds,
    totalVolume: summary.totalVolume,
    setCount: summary.setCount,
    prCount: summary.prCount,
    exercises: groups.map((group) => ({
      ...group,
      supersetLabel: labels.get(group.sessionExerciseId) ?? null,
      sets: group.sets.map((set) => ({ ...set, rpe: rpeBySetId.get(set.id) ?? null })),
    })),
  };
}
