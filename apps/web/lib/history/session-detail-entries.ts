import type { ExerciseRow, PersonalRecordRow, SessionExerciseRow, SetRow } from "@/lib/db/schema";
import { type PrKind, isVisiblePrKind, resolveCurrentRows } from "@jim/core";

export interface SessionDetailSet {
  id: string;
  setIndex: number;
  kind: SetRow["kind"];
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distance: number | null;
  /** Rest taken before the set and its target (issue #233). */
  restSeconds: number | null;
  restTargetSeconds: number | null;
  /** PR kinds the set achieved that show outside the PR page (`isVisiblePrKind`). */
  prKinds: PrKind[];
}

export interface SessionDetailExercise {
  sessionExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  notes: string | null;
  sets: SessionDetailSet[];
}

/**
 * "Session detail: every exercise, every set, PRs achieved" (STORIES.md S7)
 * — every current (resolved, non-deleted) set for one session, grouped by
 * exercise in routine order, each set tagged with whichever visible PR kinds
 * it achieved (only e1RM, issue #389).
 */
export function buildSessionDetailExercises(
  sessionId: string,
  sessionExercises: readonly SessionExerciseRow[],
  exercises: readonly Pick<ExerciseRow, "id" | "name">[],
  sets: readonly SetRow[],
  personalRecords: readonly PersonalRecordRow[],
): SessionDetailExercise[] {
  const exerciseNames = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));

  const resolvedSets = resolveCurrentRows(sets).filter((set) => !set.deletedAt);
  const setsBySessionExercise = new Map<string, SetRow[]>();
  for (const set of resolvedSets) {
    const list = setsBySessionExercise.get(set.sessionExerciseId);
    if (list) {
      list.push(set);
    } else {
      setsBySessionExercise.set(set.sessionExerciseId, [set]);
    }
  }

  const prKindsBySetId = new Map<string, PrKind[]>();
  for (const record of personalRecords) {
    if (record.deletedAt || !record.setId || !isVisiblePrKind(record.kind)) continue;
    const list = prKindsBySetId.get(record.setId);
    if (list) {
      list.push(record.kind);
    } else {
      prKindsBySetId.set(record.setId, [record.kind]);
    }
  }

  return sessionExercises
    .filter(
      (sessionExercise) => sessionExercise.sessionId === sessionId && !sessionExercise.deletedAt,
    )
    .sort((a, b) => a.position - b.position)
    .map((sessionExercise) => ({
      sessionExerciseId: sessionExercise.id,
      exerciseId: sessionExercise.exerciseId,
      exerciseName: exerciseNames.get(sessionExercise.exerciseId) ?? "Unknown exercise",
      notes: sessionExercise.notes,
      sets: (setsBySessionExercise.get(sessionExercise.id) ?? [])
        .sort((a, b) => a.setIndex - b.setIndex)
        .map((set) => ({
          id: set.id,
          setIndex: set.setIndex,
          kind: set.kind,
          weight: set.weight == null ? null : Number(set.weight),
          reps: set.reps,
          durationSeconds: set.durationSeconds,
          distance: set.distance == null ? null : Number(set.distance),
          restSeconds: set.restSeconds ?? null,
          restTargetSeconds: set.restTargetSeconds ?? null,
          prKinds: prKindsBySetId.get(set.id) ?? [],
        })),
    }));
}
