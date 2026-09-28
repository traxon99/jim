import { type JimDatabase, db } from "@/lib/db/schema";
import type { StickyNoteSource } from "@jim/core";

/**
 * Every other workout's sticky note value for an exercise (issue #271), for
 * `resolveStickyNote` to pick the newest from. Deleted rows and cancelled
 * (deleted) workouts don't count.
 */
export async function loadEarlierStickyNotes(
  exerciseId: string,
  currentSessionId: string,
  database: JimDatabase = db,
): Promise<StickyNoteSource[]> {
  const sessionExercises = (
    await database.sessionExercises.where("exerciseId").equals(exerciseId).toArray()
  ).filter((se) => !se.deletedAt && se.sessionId !== currentSessionId && se.stickyNote !== null);
  if (sessionExercises.length === 0) return [];

  const sessionIds = [...new Set(sessionExercises.map((se) => se.sessionId))];
  const sessions = await database.sessions.bulkGet(sessionIds);
  const sessionById = new Map(sessions.filter((s) => s != null).map((s) => [s.id, s]));

  return sessionExercises.flatMap((se) => {
    const session = sessionById.get(se.sessionId);
    if (!session || session.deletedAt) return [];
    return [{ stickyNote: se.stickyNote, startedAt: session.startedAt }];
  });
}
