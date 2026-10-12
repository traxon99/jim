import { withUserDb } from "@/lib/db/user-scoped";
import { buildPersonalRecordEntries } from "@/lib/history/pr-groups";
import { strengthProfileFromSettings } from "@/lib/strength-standards/profile";
import {
  type DbOrTx,
  bodyMeasurements,
  exercises,
  gyms,
  personalRecords,
  sessionExercises,
  sessions,
  sets,
  users,
} from "@jim/db";
import { eq, inArray } from "drizzle-orm";
import {
  type PortalOverviewData,
  type PortalTrainingData,
  buildPortalGyms,
  buildPortalSets,
  buildPortalWorkouts,
} from "./analysis-data";
import { type PortalBodyData, buildPortalBodyData } from "./body-data";
import { type PortalRecordsData, serializeRecordEntries } from "./records-data";
import {
  type PortalWorkoutDetail,
  type PortalWorkoutRow,
  buildPortalWorkoutDetail,
  buildPortalWorkoutRows,
} from "./workouts-data";

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

/** The Workouts section's table: every finished workout (issue #470). */
export async function loadWorkoutRows(): Promise<{
  units: "lb" | "kg";
  workouts: PortalWorkoutRow[];
}> {
  return withUserDb(async (tx, userId) => {
    const settingsRows = await tx
      .select({ units: users.units })
      .from(users)
      .where(eq(users.id, userId));
    const sessionRows = await tx.select().from(sessions);
    const sessionExerciseRows = await tx.select().from(sessionExercises);
    const setRows = await tx.select().from(sets);
    const prRows = await tx.select().from(personalRecords);
    const gymRows = await tx
      .select({ id: gyms.id, name: gyms.name, deletedAt: gyms.deletedAt })
      .from(gyms);
    const exerciseIds = [...new Set(sessionExerciseRows.map((row) => row.exerciseId))];
    const exerciseRows =
      exerciseIds.length === 0
        ? []
        : await tx.select().from(exercises).where(inArray(exercises.id, exerciseIds));
    return {
      units: settingsRows[0]?.units ?? "lb",
      workouts: buildPortalWorkoutRows(
        sessionRows,
        sessionExerciseRows,
        exerciseRows,
        setRows,
        prRows,
        gymRows,
      ),
    };
  });
}

/** One workout in full for /portal/workouts/[id], or null when it's gone. */
export async function loadWorkoutDetail(
  sessionId: string,
): Promise<{ units: "lb" | "kg"; workout: PortalWorkoutDetail | null }> {
  return withUserDb(async (tx, userId) => {
    const settingsRows = await tx
      .select({ units: users.units })
      .from(users)
      .where(eq(users.id, userId));
    const units = settingsRows[0]?.units ?? "lb";
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session) return { units, workout: null };
    const sessionExerciseRows = await tx
      .select()
      .from(sessionExercises)
      .where(eq(sessionExercises.sessionId, sessionId));
    const sessionExerciseIds = sessionExerciseRows.map((row) => row.id);
    const setRows =
      sessionExerciseIds.length === 0
        ? []
        : await tx.select().from(sets).where(inArray(sets.sessionExerciseId, sessionExerciseIds));
    const setIds = setRows.map((row) => row.id);
    const prRows =
      setIds.length === 0
        ? []
        : await tx.select().from(personalRecords).where(inArray(personalRecords.setId, setIds));
    const exerciseIds = [...new Set(sessionExerciseRows.map((row) => row.exerciseId))];
    const exerciseRows =
      exerciseIds.length === 0
        ? []
        : await tx.select().from(exercises).where(inArray(exercises.id, exerciseIds));
    const gymRows = session.gymId
      ? await tx
          .select({ id: gyms.id, name: gyms.name, deletedAt: gyms.deletedAt })
          .from(gyms)
          .where(eq(gyms.id, session.gymId))
      : [];
    return {
      units,
      workout: buildPortalWorkoutDetail(
        session,
        sessionExerciseRows,
        exerciseRows,
        setRows,
        prRows,
        gymRows,
      ),
    };
  });
}

/** The Body section: every weigh-in and measurement (issue #470). */
export async function loadBodyData(): Promise<PortalBodyData> {
  return withUserDb(async (tx, userId) => {
    const settingsRows = await tx
      .select({ units: users.units })
      .from(users)
      .where(eq(users.id, userId));
    const rows = await tx.select().from(bodyMeasurements);
    return buildPortalBodyData(rows, settingsRows[0]?.units ?? "lb");
  });
}

/** The Records section: every live PR and what it needs to badge them (issue #470). */
export async function loadRecordsData(): Promise<PortalRecordsData> {
  return withUserDb(async (tx, userId) => {
    const [settings] = await tx
      .select({
        units: users.units,
        sex: users.sex,
        birthdate: users.birthdate,
        bodyweight: users.bodyweight,
      })
      .from(users)
      .where(eq(users.id, userId));
    const units = settings?.units ?? "lb";
    const prRows = await tx.select().from(personalRecords);
    const sessionRows = await tx.select().from(sessions);
    const sessionExerciseRows = await tx.select().from(sessionExercises);
    const setRows = await tx.select().from(sets);
    const measurementRows = await tx.select().from(bodyMeasurements);
    const exerciseIds = [...new Set(prRows.map((row) => row.exerciseId))];
    const exerciseRows =
      exerciseIds.length === 0
        ? []
        : await tx.select().from(exercises).where(inArray(exercises.id, exerciseIds));

    const entries = buildPersonalRecordEntries(
      prRows,
      sessionRows,
      sessionExerciseRows,
      setRows,
      exerciseRows,
    );
    return {
      units,
      entries: serializeRecordEntries(entries),
      exercises: exerciseRows.map((exercise) => ({
        id: exercise.id,
        slug: exercise.slug,
        name: exercise.name,
        aliases: exercise.aliases,
        ownerId: exercise.ownerId,
        isArchived: exercise.isArchived,
        primaryMuscles: exercise.primaryMuscles,
        secondaryMuscles: exercise.secondaryMuscles,
        equipment: exercise.equipment,
        category: exercise.category,
        trackingType: exercise.trackingType,
        machineBrand: exercise.machineBrand ?? null,
        machineModel: exercise.machineModel ?? null,
      })),
      strengthProfile: settings ? strengthProfileFromSettings(settings) : null,
      bodyweight: buildPortalBodyData(measurementRows, units).bodyweight,
    };
  });
}
