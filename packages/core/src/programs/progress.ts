import { type EstimateOneRepMaxOptions, estimateOneRepMax } from "../one-rep-max";

export interface ProgramProgressSession {
  id: string;
  routineId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  deletedAt: Date | null;
}

/**
 * A current, non-deleted working set (warm-up sets and warm-up exercises
 * already left out, issue #395), tagged with its session and exercise.
 */
export interface ProgramProgressSet {
  sessionId: string;
  exerciseId: string;
  weight: number | null;
  reps: number | null;
}

export interface ProgramExerciseProgress {
  exerciseId: string;
  /** Workouts in the program that logged a weighted set of this exercise. */
  sessionCount: number;
  /** Best estimated 1RM in the first and the latest of those workouts. */
  firstE1rm: number;
  latestE1rm: number;
  change: number;
}

export interface ProgramProgress {
  workoutCount: number;
  firstAt: Date | null;
  lastAt: Date | null;
  setCount: number;
  /** Sum of weight × reps across the program's working sets. */
  totalVolume: number;
  /** Most-trained exercises first. */
  exercises: ProgramExerciseProgress[];
}

/**
 * "Progress over workouts done in this program" (issue #414). Sessions don't
 * carry a program id, so a workout counts toward the program when it ran one
 * of the program's routines and finished on or after `since` (when the
 * program was last activated, or created). Per exercise, compares the best
 * estimated 1RM of its first workout in the program with its latest one.
 */
export function summarizeProgramProgress(
  input: {
    routineIds: Iterable<string>;
    since: Date | null;
    sessions: readonly ProgramProgressSession[];
    sets: readonly ProgramProgressSet[];
  },
  options: EstimateOneRepMaxOptions = {},
): ProgramProgress {
  const routineIds = new Set(input.routineIds);
  const sinceTime = input.since?.getTime() ?? Number.NEGATIVE_INFINITY;
  const sessions = input.sessions
    .filter(
      (session): session is ProgramProgressSession & { endedAt: Date } =>
        !session.deletedAt &&
        session.endedAt !== null &&
        session.routineId !== null &&
        routineIds.has(session.routineId) &&
        session.endedAt.getTime() >= sinceTime,
    )
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const order = new Map(sessions.map((session, index) => [session.id, index]));

  let setCount = 0;
  let totalVolume = 0;
  // exerciseId → session index → best e1RM in that session
  const bestByExercise = new Map<string, Map<number, number>>();
  for (const set of input.sets) {
    const index = order.get(set.sessionId);
    if (index === undefined) continue;
    setCount += 1;
    if (set.weight == null || set.reps == null || set.weight <= 0 || set.reps <= 0) continue;
    totalVolume += set.weight * set.reps;
    const value = estimateOneRepMax(set.weight, set.reps, options);
    let bySession = bestByExercise.get(set.exerciseId);
    if (!bySession) {
      bySession = new Map();
      bestByExercise.set(set.exerciseId, bySession);
    }
    if (value > (bySession.get(index) ?? 0)) bySession.set(index, value);
  }

  const exercises: ProgramExerciseProgress[] = [];
  for (const [exerciseId, bySession] of bestByExercise) {
    const indexes = [...bySession.keys()].sort((a, b) => a - b);
    const firstE1rm = bySession.get(indexes[0] as number) as number;
    const latestE1rm = bySession.get(indexes[indexes.length - 1] as number) as number;
    exercises.push({
      exerciseId,
      sessionCount: indexes.length,
      firstE1rm,
      latestE1rm,
      change: latestE1rm - firstE1rm,
    });
  }
  exercises.sort((a, b) => b.sessionCount - a.sessionCount || b.latestE1rm - a.latestE1rm);

  return {
    workoutCount: sessions.length,
    firstAt: sessions[0]?.startedAt ?? null,
    lastAt: sessions[sessions.length - 1]?.startedAt ?? null,
    setCount,
    totalVolume,
    exercises,
  };
}
