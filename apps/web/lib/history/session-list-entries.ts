import type { PersonalRecordRow, SessionExerciseRow, SessionRow, SetRow } from "@/lib/db/schema";
import { type SessionListEntry, resolveCurrentRows, summarizeSession } from "@jim/core";

/**
 * Builds one `SessionListEntry` per finished session from Dexie's raw
 * tables, mirroring the read pipeline used elsewhere (S4-S6): a live query
 * fetches raw rows once, then a pure function does the rest, so this stays
 * testable against Dexie without rendering React.
 */
export function buildSessionListEntries(
  sessions: readonly SessionRow[],
  sessionExercises: readonly SessionExerciseRow[],
  sets: readonly SetRow[],
  personalRecords: readonly PersonalRecordRow[],
): SessionListEntry[] {
  const sessionExerciseIdsBySession = new Map<string, string[]>();
  for (const sessionExercise of sessionExercises) {
    if (sessionExercise.deletedAt) continue;
    const list = sessionExerciseIdsBySession.get(sessionExercise.sessionId);
    if (list) {
      list.push(sessionExercise.id);
    } else {
      sessionExerciseIdsBySession.set(sessionExercise.sessionId, [sessionExercise.id]);
    }
  }

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

  // A count of achieved PR *rows*, not distinct sets — one set can beat
  // several PR kinds at once (see set-actions.ts's detectAndRecordPrs),
  // and each counts. Mirrors SessionSummary's prCount (S6).
  const livePersonalRecordSetIds = personalRecords
    .filter((pr) => !pr.deletedAt && pr.setId)
    .map((pr) => pr.setId as string);

  return sessions
    .filter((session) => session.endedAt && !session.deletedAt)
    .map((session) => {
      const sessionExerciseIds = sessionExerciseIdsBySession.get(session.id) ?? [];
      const sessionSets = sessionExerciseIds.flatMap(
        (sessionExerciseId) => setsBySessionExercise.get(sessionExerciseId) ?? [],
      );
      const sessionSetIds = new Set(sessionSets.map((set) => set.id));
      const prCount = livePersonalRecordSetIds.filter((setId) => sessionSetIds.has(setId)).length;

      const summary = summarizeSession(
        sessionSets.map((set) => ({
          weight: set.weight == null ? null : Number(set.weight),
          reps: set.reps,
        })),
        session.startedAt,
        session.endedAt as Date,
        prCount,
      );

      return {
        id: session.id,
        name: session.name,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        totalVolume: summary.totalVolume,
        setCount: summary.setCount,
        prCount: summary.prCount,
      };
    });
}
