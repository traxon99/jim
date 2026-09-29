import type { ExerciseRow, SessionExerciseRow, SetRow } from "@/lib/db/schema";
import { resolveCurrentRows } from "@jim/core";

export interface ExerciseHighlight {
  exerciseName: string;
  /** Null for a bodyweight or reps-only best set. */
  weight: number | null;
  reps: number | null;
}

type HighlightSet = Pick<
  SetRow,
  "id" | "sessionExerciseId" | "kind" | "weight" | "reps" | "supersedesId" | "deletedAt"
>;

function isBetter(candidate: HighlightSet, best: HighlightSet): boolean {
  const weight = candidate.weight == null ? null : Number(candidate.weight);
  const bestWeight = best.weight == null ? null : Number(best.weight);
  if ((weight ?? 0) !== (bestWeight ?? 0)) return (weight ?? 0) > (bestWeight ?? 0);
  return (candidate.reps ?? 0) > (best.reps ?? 0);
}

/**
 * Each session's exercises, in workout order, with their best set — the
 * heaviest, then the most reps at that weight — for History's recent
 * workout cards (issue #328), as Strong's history cards show. Warm-up sets
 * only count when an exercise has nothing else. Exercises with no logged
 * sets are left out.
 */
export function buildSessionHighlights(
  sessionExercises: readonly Pick<
    SessionExerciseRow,
    "id" | "sessionId" | "exerciseId" | "position" | "deletedAt"
  >[],
  exercises: readonly Pick<ExerciseRow, "id" | "name">[],
  sets: readonly HighlightSet[],
): Map<string, ExerciseHighlight[]> {
  const nameById = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));

  const setsBySessionExercise = new Map<string, HighlightSet[]>();
  for (const set of resolveCurrentRows(sets)) {
    if (set.deletedAt) continue;
    const list = setsBySessionExercise.get(set.sessionExerciseId);
    if (list) list.push(set);
    else setsBySessionExercise.set(set.sessionExerciseId, [set]);
  }

  const bySession = new Map<string, ExerciseHighlight[]>();
  const ordered = [...sessionExercises]
    .filter((sessionExercise) => !sessionExercise.deletedAt)
    .sort((a, b) => a.position - b.position);
  for (const sessionExercise of ordered) {
    const all = setsBySessionExercise.get(sessionExercise.id) ?? [];
    const working = all.filter((set) => set.kind !== "warmup");
    const candidates = working.length > 0 ? working : all;
    let best: HighlightSet | null = null;
    for (const set of candidates) {
      if (!best || isBetter(set, best)) best = set;
    }
    if (!best) continue;

    const highlight: ExerciseHighlight = {
      exerciseName: nameById.get(sessionExercise.exerciseId) ?? "Exercise",
      weight: best.weight == null ? null : Number(best.weight),
      reps: best.reps,
    };
    const list = bySession.get(sessionExercise.sessionId);
    if (list) list.push(highlight);
    else bySession.set(sessionExercise.sessionId, [highlight]);
  }
  return bySession;
}

/** "185 × 5", "× 12" for bodyweight, or "185" with no reps logged. */
export function formatHighlightSet(highlight: ExerciseHighlight): string {
  if (highlight.weight != null && highlight.weight > 0) {
    return highlight.reps != null
      ? `${highlight.weight} × ${highlight.reps}`
      : `${highlight.weight}`;
  }
  return highlight.reps != null ? `× ${highlight.reps}` : "—";
}
