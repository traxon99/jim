interface SessionTombstone {
  id: string;
  deletedAt: Date | null;
}

interface SessionExerciseTombstone {
  id: string;
  sessionId: string;
  deletedAt: Date | null;
}

/**
 * Session exercises whose sets no longer count anywhere: the exercise was
 * removed from its workout, or the whole workout was deleted. Deleting a
 * workout only tombstones its `sessions` row (issue #99) — its
 * session_exercises, sets and personal_records are left as they were — so
 * every read of sets or PRs across sessions has to check this, not just
 * `set.deletedAt` (issue #200).
 *
 * Only a positive tombstone excludes: a session exercise whose session
 * isn't in `sessions` at all is kept, so a caller that loaded a narrower
 * set of sessions can't hide live data by accident.
 */
export function deletedSessionExerciseIds(
  sessions: readonly SessionTombstone[],
  sessionExercises: readonly SessionExerciseTombstone[],
): Set<string> {
  const deletedSessionIds = new Set(
    sessions.filter((session) => session.deletedAt).map((session) => session.id),
  );
  const result = new Set<string>();
  for (const sessionExercise of sessionExercises) {
    if (sessionExercise.deletedAt || deletedSessionIds.has(sessionExercise.sessionId)) {
      result.add(sessionExercise.id);
    }
  }
  return result;
}

/**
 * Drops PR rows that were set by a set in a deleted workout or a removed
 * exercise (see `deletedSessionExerciseIds`). `sets` must include the rows
 * PRs point at — a PR's `setId` is the set as it was when logged, which a
 * later edit supersedes but never removes, so pass raw rows rather than
 * `resolveCurrentRows` output. PRs with no `setId`, or whose set isn't in
 * `sets`, are kept. Earlier PR rows for the same exercise aren't touched, so
 * once a deleted workout's PR drops out the previous best is current again.
 */
export function withoutDeletedSessionRecords<T extends { setId: string | null }>(
  records: readonly T[],
  sets: readonly { id: string; sessionExerciseId: string }[],
  deletedSessionExercises: ReadonlySet<string>,
): T[] {
  if (deletedSessionExercises.size === 0) return [...records];
  const sessionExerciseIdBySetId = new Map(sets.map((set) => [set.id, set.sessionExerciseId]));
  return records.filter((record) => {
    if (!record.setId) return true;
    const sessionExerciseId = sessionExerciseIdBySetId.get(record.setId);
    return !sessionExerciseId || !deletedSessionExercises.has(sessionExerciseId);
  });
}
