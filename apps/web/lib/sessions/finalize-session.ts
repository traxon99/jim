import { mutate } from "@/lib/db/mutate";
import { type JimDatabase, type SessionRow, db } from "@/lib/db/schema";
import { getDeviceId, runSyncCycle } from "@/lib/sync/engine";
import { resolveCurrentRows } from "@jim/core";

/** True once at least one non-deleted set has been logged anywhere in the session. */
async function hasLoggedSets(sessionId: string, database: JimDatabase): Promise<boolean> {
  const sessionExerciseIds = await database.sessionExercises
    .where("sessionId")
    .equals(sessionId)
    .primaryKeys();
  if (sessionExerciseIds.length === 0) return false;

  const allSets = await database.sets
    .where("sessionExerciseId")
    .anyOf(sessionExerciseIds)
    .toArray();
  return resolveCurrentRows(allSets).some((set) => !set.deletedAt);
}

/**
 * Ends the session and pushes immediately — session finalize is its own
 * sync trigger (ADR-002, docs/ARCHITECTURE.md §3), not something that waits
 * for the next foreground trigger. A session with no exercises added, or none
 * with any set logged, is cancelled (soft-deleted) instead of being tracked.
 */
export async function finalizeSession(
  session: SessionRow,
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
): Promise<{ cancelled: boolean }> {
  const deviceId = await getDeviceId(database);
  const now = new Date();
  const cancelled = !(await hasLoggedSets(session.id, database));

  await mutate(
    "sessions",
    cancelled
      ? { ...session, deletedAt: now, updatedAt: now, deviceId }
      : { ...session, endedAt: now, updatedAt: now, deviceId },
    database,
  );
  await runSyncCycle(database, fetchImpl);
  return { cancelled };
}

/**
 * Discards an in-progress session outright, regardless of whether any sets
 * were logged — the explicit "Cancel workout" action, distinct from the
 * implicit cancel `finalizeSession` performs for an empty session on
 * Finish. Same soft-delete + immediate sync as finalize (ADR-002).
 */
export async function cancelSession(
  session: SessionRow,
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const deviceId = await getDeviceId(database);
  const now = new Date();
  await mutate("sessions", { ...session, deletedAt: now, updatedAt: now, deviceId }, database);
  await runSyncCycle(database, fetchImpl);
}
