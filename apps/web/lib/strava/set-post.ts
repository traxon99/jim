import { mutate } from "@/lib/db/mutate";
import { type JimDatabase, type SessionRow, db } from "@/lib/db/schema";
import { getDeviceId, runSyncCycle } from "@/lib/sync/engine";

/**
 * Saves whether this workout goes to Strava (issue #836): true posts it even
 * with auto-post off, false skips it. A normal session edit (last write wins,
 * synced like any other field); the server decides from its own copy, and a
 * workout finished offline posts once it syncs.
 */
export async function setSessionStravaPost(
  session: SessionRow,
  stravaPost: boolean,
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const deviceId = await getDeviceId(database);
  // The latest stored row, not a copy a screen has been holding.
  const current = (await database.sessions.get(session.id)) ?? session;
  await mutate("sessions", { ...current, stravaPost, updatedAt: new Date(), deviceId }, database);
  await runSyncCycle(database, fetchImpl);
}
