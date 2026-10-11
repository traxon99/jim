import {
  type ExerciseCategory,
  exerciseDisplayName,
  gymCoordinates,
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

/** A gym pinned to a real place (issue #462), for the Analysis map. */
export interface PortalGym {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  isHome: boolean;
}

/** One finished workout at a pinned gym: when it started, as an ISO string. */
export interface PortalGymVisit {
  gymId: string;
  startedAt: string;
}

/** Everything the portal dashboard renders, serializable across the server/client boundary. */
export interface PortalData {
  email: string;
  units: "lb" | "kg";
  weekStart: number;
  sets: PortalSet[];
  exercises: PortalExercise[];
  gyms: PortalGym[];
  gymVisits: PortalGymVisit[];
}

interface PortalGymRow {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
  deletedAt: Date | null;
}

interface PortalGymSessionRow {
  gymId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  deletedAt: Date | null;
}

/**
 * The Analysis map's data (issue #462): live gyms that are matched to a
 * real place, and every finished, not-deleted workout logged at one of
 * them. Gyms with a typed-only address have nowhere to go on a map, so
 * they're left out.
 */
export function buildPortalGyms(
  gyms: readonly PortalGymRow[],
  sessions: readonly PortalGymSessionRow[],
): { gyms: PortalGym[]; gymVisits: PortalGymVisit[] } {
  const pinned: PortalGym[] = [];
  for (const gym of gyms) {
    if (gym.deletedAt) continue;
    const coordinates = gymCoordinates(gym);
    if (!coordinates) continue;
    pinned.push({
      id: gym.id,
      name: gym.name,
      address: gym.address,
      ...coordinates,
      isHome: gym.isDefault,
    });
  }
  const pinnedIds = new Set(pinned.map((gym) => gym.id));
  const gymVisits = sessions
    .filter((session) => !session.deletedAt && session.endedAt && session.gymId)
    .filter((session) => pinnedIds.has(session.gymId as string))
    .map((session) => ({
      gymId: session.gymId as string,
      startedAt: session.startedAt.toISOString(),
    }));
  return { gyms: pinned, gymVisits };
}

/** Workouts per gym id started at or after `since` (all time when null). */
export function countGymVisits(
  visits: readonly PortalGymVisit[],
  since: Date | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  const from = since?.getTime() ?? Number.NEGATIVE_INFINITY;
  for (const visit of visits) {
    if (new Date(visit.startedAt).getTime() < from) continue;
    counts.set(visit.gymId, (counts.get(visit.gymId) ?? 0) + 1);
  }
  return counts;
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
