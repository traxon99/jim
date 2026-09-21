import { mutate } from "@/lib/db/mutate";
import { type JimDatabase, type SessionRow, db } from "@/lib/db/schema";
import { getDeviceId, runSyncCycle } from "@/lib/sync/engine";

/**
 * Ends the session and pushes immediately — session finalize is its own
 * sync trigger (ADR-002, docs/ARCHITECTURE.md §3), not something that waits
 * for the next foreground trigger.
 */
export async function finalizeSession(
  session: SessionRow,
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const deviceId = await getDeviceId(database);
  const now = new Date();
  await mutate("sessions", { ...session, endedAt: now, updatedAt: now, deviceId }, database);
  await runSyncCycle(database, fetchImpl);
}
