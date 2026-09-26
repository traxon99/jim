import { buildExerciseUsage } from "../exercises/usage";
import { DPR_FOCUS_CANDIDATE_COUNT, DPR_FOCUS_WINDOW_DAYS } from "./presets";

export interface FocusCandidateExercise {
  id: string;
  name: string;
  trackingType: string;
}

export interface FocusCandidate<T extends FocusCandidateExercise = FocusCandidateExercise> {
  exercise: T;
  /** Distinct sessions in the last 90 days. */
  frequency: number;
  lastPerformedAt: Date;
}

const WEIGHTED_TRACKING = new Set(["weight_reps", "weighted_bodyweight"]);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The lifts DPR offers as focus picks (issue #209): the top 10 weighted
 * exercises by distinct sessions in the last 90 days. Ties go to the more
 * recently performed, then by name.
 */
export function focusCandidates<T extends FocusCandidateExercise>(
  sessionExercises: readonly { exerciseId: string; sessionId: string; startedAt: Date }[],
  exercises: readonly T[],
  now: Date,
): FocusCandidate<T>[] {
  const since = now.getTime() - DPR_FOCUS_WINDOW_DAYS * DAY_MS;
  const usage = buildExerciseUsage(
    sessionExercises.filter((se) => {
      const t = se.startedAt.getTime();
      return t >= since && t <= now.getTime();
    }),
  );

  const candidates: FocusCandidate<T>[] = [];
  for (const exercise of exercises) {
    if (!WEIGHTED_TRACKING.has(exercise.trackingType)) continue;
    const u = usage.get(exercise.id);
    if (!u) continue;
    candidates.push({ exercise, frequency: u.frequency, lastPerformedAt: u.lastPerformedAt });
  }
  return candidates
    .sort(
      (a, b) =>
        b.frequency - a.frequency ||
        b.lastPerformedAt.getTime() - a.lastPerformedAt.getTime() ||
        a.exercise.name.localeCompare(b.exercise.name),
    )
    .slice(0, DPR_FOCUS_CANDIDATE_COUNT);
}
