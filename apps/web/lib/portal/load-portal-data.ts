import { withUserDb } from "@/lib/db/user-scoped";
import { type DbOrTx, exercises, gyms, sessionExercises, sessions, sets, users } from "@jim/db";
import { eq, inArray } from "drizzle-orm";
import {
  type PortalOverviewData,
  type PortalTrainingData,
  buildPortalGyms,
  buildPortalSets,
  buildPortalWorkouts,
} from "./analysis-data";

/**
 * Every working set the user has logged, joined and resolved, plus the
 * workouts they belong to. Sequential rather than Promise.all: these share
 * one transaction's connection (runAsUser), which runs one statement at a
 * time anyway.
 */
async function readTrainingData(tx: DbOrTx, userId: string) {
  const settingsRows = await tx
    .select({ units: users.units, weekStart: users.weekStart })
    .from(users)
    .where(eq(users.id, userId));
  const sessionRows = await tx
    .select({
      id: sessions.id,
      name: sessions.name,
      gymId: sessions.gymId,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      deletedAt: sessions.deletedAt,
    })
    .from(sessions);
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
            primaryMuscles: exercises.primaryMuscles,
          })
          .from(exercises)
          .where(inArray(exercises.id, exerciseIds));

  const settings = settingsRows[0];
  const portalSets = buildPortalSets(sessionRows, sessionExerciseRows, exerciseRows, setRows);
  const data: PortalTrainingData = {
    units: settings?.units ?? "lb",
    weekStart: settings?.weekStart ?? 0,
    ...portalSets,
    workouts: buildPortalWorkouts(sessionRows, portalSets.sets, exerciseRows),
  };
  return { data, sessionRows };
}

/**
 * The web portal (issue #38) reads straight from Postgres under the
 * signed-in user's RLS scope (`withUserDb`, ADR-005/006). Read-only: the
 * portal never writes, so it can run in a desktop browser without breaking
 * ADR-010's reason for gating the app on install (nothing here is stored
 * locally to be evicted). Each section has its own loader (issue #470) so a
 * page reads only what it shows.
 */
export async function loadOverviewData(): Promise<PortalOverviewData> {
  return withUserDb(async (tx, userId) => {
    const { data, sessionRows } = await readTrainingData(tx, userId);
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
    return { ...data, ...buildPortalGyms(gymRows, sessionRows) };
  });
}

/** The Exercises section's strength table and e1RM chart (issue #470). */
export async function loadStrengthData(): Promise<PortalTrainingData> {
  return withUserDb(async (tx, userId) => (await readTrainingData(tx, userId)).data);
}
