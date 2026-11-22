"use client";

import { db } from "@/lib/db/schema";
import {
  PACE_HISTORY_MAX_SESSIONS,
  type PaceCalibration,
  type PaceHistorySession,
  calibratePace,
  isWarmupExercise,
  resolveCurrentRows,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";

/**
 * The pace plan learned from this routine's last few finished workouts
 * (issue #853). Null for a workout without a routine, or before there's any
 * history, so the tracker keeps its fixed plan.
 */
export function usePaceCalibration(
  session: { id: string; routineId: string | null; startedAt: Date } | null | undefined,
  currentExerciseIds: readonly string[],
): PaceCalibration | null {
  const sessionId = session?.id ?? null;
  const routineId = session?.routineId ?? null;
  const startedAtMs = session?.startedAt.getTime() ?? null;

  const history = useLiveQuery(async (): Promise<PaceHistorySession[]> => {
    if (!sessionId || !routineId || startedAtMs === null) return [];
    const past = (
      await db.sessions
        .filter(
          (row) =>
            row.routineId === routineId &&
            row.id !== sessionId &&
            !row.deletedAt &&
            row.endedAt != null &&
            row.startedAt.getTime() < startedAtMs,
        )
        .toArray()
    )
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, PACE_HISTORY_MAX_SESSIONS);
    if (past.length === 0) return [];

    const items = (
      await db.sessionExercises
        .where("sessionId")
        .anyOf(past.map((row) => row.id))
        .toArray()
    ).filter((item) => !item.deletedAt);
    const exercises = await db.exercises.bulkGet([...new Set(items.map((i) => i.exerciseId))]);
    const warmupIds = new Set(
      exercises.filter((e) => e != null && isWarmupExercise(e)).map((e) => e?.id),
    );
    const main = items.filter((item) => !warmupIds.has(item.exerciseId));
    const sets = resolveCurrentRows(
      await db.sets
        .where("sessionExerciseId")
        .anyOf(main.map((item) => item.id))
        .toArray(),
    ).filter((set) => !set.deletedAt);

    return past.map((row) => ({
      startedAt: row.startedAt,
      exercises: main
        .filter((item) => item.sessionId === row.id)
        .map((item) => ({
          exerciseId: item.exerciseId,
          inSuperset: item.supersetGroup != null,
          sets: sets
            .filter((set) => set.sessionExerciseId === item.id)
            .map((set) => ({
              completedAt: set.completedAt,
              restTargetSeconds: set.restTargetSeconds,
            })),
        })),
    }));
  }, [sessionId, routineId, startedAtMs]);

  const idsKey = currentExerciseIds.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: idsKey stands in for the id list
  return useMemo(
    () => (history ? calibratePace({ currentExerciseIds, history }) : null),
    [history, idsKey],
  );
}
