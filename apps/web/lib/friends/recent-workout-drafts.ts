import { db } from "@/lib/db/schema";
import {
  isVisiblePr,
  repsAtWeightExerciseIds,
  resolveCurrentRows,
  summarizeSession,
} from "@jim/core";
import { workoutPostDraft } from "./post-drafts";

export interface RecentWorkoutDraft {
  sessionId: string;
  name: string | null;
  startedAt: Date;
  draft: ReturnType<typeof workoutPostDraft>;
}

/**
 * Your latest finished workouts as ready-to-post drafts, newest first, for
 * Home's + button (issue #747). Read from Dexie like the summary screen, with
 * the same numbers: working sets only, visible PRs only.
 */
export async function recentWorkoutDrafts(
  units: "lb" | "kg",
  limit = 5,
): Promise<RecentWorkoutDraft[]> {
  const sessions = (await db.sessions.toArray())
    .filter((session) => session.endedAt && !session.deletedAt)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, limit);
  if (sessions.length === 0) return [];

  const [exercises, personalRecords] = await Promise.all([
    db.exercises.toArray(),
    db.personalRecords.toArray(),
  ]);
  const repsExerciseIds = repsAtWeightExerciseIds(exercises);

  return Promise.all(
    sessions.map(async (session) => {
      const sessionExercises = (
        await db.sessionExercises.where("sessionId").equals(session.id).toArray()
      ).filter((se) => !se.deletedAt);
      const rawSets =
        sessionExercises.length > 0
          ? await db.sets
              .where("sessionExerciseId")
              .anyOf(sessionExercises.map((se) => se.id))
              .toArray()
          : [];
      const sets = resolveCurrentRows(rawSets).filter((set) => !set.deletedAt);
      const setIds = new Set(sets.map((set) => set.id));
      const prCount = personalRecords.filter(
        (pr) =>
          !pr.deletedAt && pr.setId && setIds.has(pr.setId) && isVisiblePr(pr, repsExerciseIds),
      ).length;
      const summary = summarizeSession(
        sets.map((set) => ({
          weight: set.weight == null ? null : Number(set.weight),
          reps: set.reps,
          kind: set.kind,
        })),
        session.startedAt,
        session.endedAt ?? session.startedAt,
        prCount,
      );
      return {
        sessionId: session.id,
        name: session.name,
        startedAt: session.startedAt,
        draft: workoutPostDraft(session, summary, units),
      };
    }),
  );
}
