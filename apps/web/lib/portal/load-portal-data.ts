import { withUserDb } from "@/lib/db/user-scoped";
import { exercises, gyms, sessionExercises, sessions, sets, users } from "@jim/db";
import { eq, inArray } from "drizzle-orm";
import { type PortalData, buildPortalGyms, buildPortalSets } from "./analysis-data";

/**
 * Reads everything the web portal (issue #38) analyses straight from
 * Postgres under the signed-in user's RLS scope (`withUserDb`, ADR-005/006).
 * Read-only: the portal never writes, so it can run in a desktop browser
 * without breaking ADR-010's reason for gating the app on install (nothing
 * here is stored locally to be evicted).
 */
export async function loadPortalData(): Promise<PortalData> {
  return withUserDb(async (tx, userId, email) => {
    // Sequential rather than Promise.all: these share one transaction's
    // connection (runAsUser), which runs one statement at a time anyway.
    const settingsRows = await tx
      .select({ units: users.units, weekStart: users.weekStart })
      .from(users)
      .where(eq(users.id, userId));
    const sessionRows = await tx
      .select({
        id: sessions.id,
        gymId: sessions.gymId,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
        deletedAt: sessions.deletedAt,
      })
      .from(sessions);
    const gymRows = await tx
      .select({
        id: gyms.id,
        name: gyms.name,
        address: gyms.address,
        latitude: gyms.latitude,
        longitude: gyms.longitude,
        isDefault: gyms.isDefault,
        deletedAt: gyms.deletedAt,
      })
      .from(gyms);
    const sessionExerciseRows = await tx
      .select({
        id: sessionExercises.id,
        sessionId: sessionExercises.sessionId,
        exerciseId: sessionExercises.exerciseId,
        deletedAt: sessionExercises.deletedAt,
      })
      .from(sessionExercises);
    const setRows = await tx
      .select({
        id: sets.id,
        sessionExerciseId: sets.sessionExerciseId,
        kind: sets.kind,
        weight: sets.weight,
        reps: sets.reps,
        completedAt: sets.completedAt,
        supersedesId: sets.supersedesId,
        deletedAt: sets.deletedAt,
      })
      .from(sets);

    const exerciseIds = [...new Set(sessionExerciseRows.map((row) => row.exerciseId))];
    const exerciseRows =
      exerciseIds.length === 0
        ? []
        : await tx
            .select({
              id: exercises.id,
              name: exercises.name,
              category: exercises.category,
              machineBrand: exercises.machineBrand,
              machineModel: exercises.machineModel,
            })
            .from(exercises)
            .where(inArray(exercises.id, exerciseIds));

    const settings = settingsRows[0];
    return {
      email,
      units: settings?.units ?? "lb",
      weekStart: settings?.weekStart ?? 0,
      ...buildPortalSets(sessionRows, sessionExerciseRows, exerciseRows, setRows),
      ...buildPortalGyms(gymRows, sessionRows),
    };
  });
}
