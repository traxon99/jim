import type { SettingsRow } from "@/lib/db/schema";
import { withUserDb } from "@/lib/db/user-scoped";
import { buildAchievementData } from "@/lib/history/achievement-data";
import { buildMuscleVolumeSets } from "@/lib/history/muscle-volume-data";
import { buildPersonalRecordEntries } from "@/lib/history/pr-groups";
import { buildSessionListEntries } from "@/lib/history/session-list-entries";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { strengthProfileFromSettings } from "@/lib/strength-standards/profile";
import {
  type DbOrTx,
  bodyMeasurements,
  dprBlockLifts,
  dprBlocks,
  exercises,
  gyms,
  personalRecords,
  programRoutines,
  programs,
  routineExercises,
  routines,
  scheduledWorkouts,
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
  serializePeriodSessions,
} from "./analysis-data";
import { type PortalBodyData, buildPortalBodyData } from "./body-data";
import { type PortalCalendarData, serializeAchievements } from "./calendar-data";
import { type PortalCardioData, buildPortalCardioData } from "./cardio-data";
import {
  type PortalExerciseDetail,
  type PortalExerciseIndexRow,
  buildExerciseIndex,
  buildPortalExerciseDetail,
} from "./exercises-data";
import { type PortalPlansData, buildPortalPlansData } from "./plans-data";
import type { PortalProgressionData } from "./progression-data";
import { type PortalRecordsData, serializeRecordEntries } from "./records-data";
import { type PortalVolumeData, serializeVolumeSets } from "./volume-data";
import {
  type PortalWorkoutDetail,
  type PortalWorkoutRow,
  buildPortalWorkoutDetail,
  buildPortalWorkoutRows,
} from "./workouts-data";

/**
 * The user's settings in the shape the phone caches them (`SettingsRow`),
 * for the shared builders that read it. Only those columns leave the server.
 */
export async function readSettingsRow(tx: DbOrTx, userId: string): Promise<SettingsRow> {
  const [user] = await tx.select().from(users).where(eq(users.id, userId));
  const settings = { ...DEFAULT_SETTINGS };
  if (user) {
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SettingsRow)[]) {
      if (key !== "id") Object.assign(settings, { [key]: user[key] });
    }
  }
  return settings;
}

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
  // Whole rows: the Overview also runs the phone's `buildSessionListEntries`
  // on them for its period comparison.
  const sessionRows = await tx.select().from(sessions);
  const sessionExerciseRows = await tx.select().from(sessionExercises);
  const setRows = await tx.select().from(sets);

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
  return { data, sessionRows, sessionExerciseRows, setRows, exerciseRows };
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
    const { data, sessionRows, sessionExerciseRows, setRows, exerciseRows } =
      await readTrainingData(tx, userId);
    const prRows = await tx.select().from(personalRecords);
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
    return {
      ...data,
      ...buildPortalGyms(gymRows, sessionRows),
      periodSessions: serializePeriodSessions(
        buildSessionListEntries(sessionRows, sessionExerciseRows, exerciseRows, setRows, prRows),
      ),
    };
  });
}

/**
 * The Exercises section (issue #470): the strength table and e1RM chart,
 * plus every exercise ever logged for the searchable list.
 */
export async function loadStrengthData(): Promise<
  PortalTrainingData & { exerciseIndex: PortalExerciseIndexRow[] }
> {
  return withUserDb(async (tx, userId) => {
    const { data, sessionRows, sessionExerciseRows, setRows, exerciseRows } =
      await readTrainingData(tx, userId);
    return {
      ...data,
      exerciseIndex: buildExerciseIndex(sessionRows, sessionExerciseRows, exerciseRows, setRows),
    };
  });
}

/** The Compare section: every working strength set, for overlaid e1RM charts (issue #470). */
export async function loadCompareData(): Promise<PortalTrainingData> {
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

/** One exercise's desktop page (issue #470), or null when it isn't the user's to see. */
export async function loadExerciseDetail(
  exerciseId: string,
): Promise<{ units: "lb" | "kg"; detail: PortalExerciseDetail | null }> {
  return withUserDb(async (tx, userId) => {
    const [settings] = await tx
      .select({ units: users.units })
      .from(users)
      .where(eq(users.id, userId));
    const units = settings?.units ?? "lb";
    const [exercise] = await tx.select().from(exercises).where(eq(exercises.id, exerciseId));
    if (!exercise) return { units, detail: null };
    const sessionExerciseRows = await tx
      .select()
      .from(sessionExercises)
      .where(eq(sessionExercises.exerciseId, exerciseId));
    const sessionIds = [...new Set(sessionExerciseRows.map((row) => row.sessionId))];
    const sessionRows =
      sessionIds.length === 0
        ? []
        : await tx.select().from(sessions).where(inArray(sessions.id, sessionIds));
    const sessionExerciseIds = sessionExerciseRows.map((row) => row.id);
    const setRows =
      sessionExerciseIds.length === 0
        ? []
        : await tx.select().from(sets).where(inArray(sets.sessionExerciseId, sessionExerciseIds));
    const prRows = await tx
      .select()
      .from(personalRecords)
      .where(eq(personalRecords.exerciseId, exerciseId));
    const [gym] = exercise.gymId
      ? await tx
          .select({ name: gyms.name, deletedAt: gyms.deletedAt })
          .from(gyms)
          .where(eq(gyms.id, exercise.gymId))
      : [];
    return {
      units,
      detail: buildPortalExerciseDetail(
        exercise,
        sessionRows,
        sessionExerciseRows,
        setRows,
        prRows,
        gym,
      ),
    };
  });
}

/**
 * The Volume section (issue #470): every working set joined to its
 * exercise's muscles, the same sets the phone's Volume by muscle screen
 * counts (`buildMuscleVolumeSets`). Weeks are grouped in the browser so
 * they follow its time zone.
 */
export async function loadVolumeData(): Promise<PortalVolumeData> {
  return withUserDb(async (tx, userId) => {
    const [settings] = await tx
      .select({ units: users.units, weekStart: users.weekStart })
      .from(users)
      .where(eq(users.id, userId));
    const sessionRows = await tx.select().from(sessions);
    const sessionExerciseRows = await tx.select().from(sessionExercises);
    const setRows = await tx.select().from(sets);
    const exerciseIds = [...new Set(sessionExerciseRows.map((row) => row.exerciseId))];
    const exerciseRows =
      exerciseIds.length === 0
        ? []
        : await tx
            .select({
              id: exercises.id,
              category: exercises.category,
              primaryMuscles: exercises.primaryMuscles,
              secondaryMuscles: exercises.secondaryMuscles,
            })
            .from(exercises)
            .where(inArray(exercises.id, exerciseIds));
    return {
      units: settings?.units ?? "lb",
      weekStart: settings?.weekStart ?? 0,
      sets: serializeVolumeSets(
        buildMuscleVolumeSets(sessionRows, sessionExerciseRows, exerciseRows, setRows),
      ),
    };
  });
}

/**
 * The Calendar section (issue #470): every finished workout for the
 * heatmap, and achievements derived the way the phone's Profile derives
 * them (`buildAchievementData`). The streak itself is counted in the
 * browser, since its weeks follow the browser's time zone; only the weekly
 * target comes from here.
 */
export async function loadCalendarData(): Promise<PortalCalendarData> {
  return withUserDb(async (tx, userId) => {
    const [settings] = await tx
      .select({
        units: users.units,
        weekStart: users.weekStart,
        bodyweight: users.bodyweight,
        sex: users.sex,
        birthdate: users.birthdate,
      })
      .from(users)
      .where(eq(users.id, userId));
    const sessionRows = await tx.select().from(sessions);
    const sessionExerciseRows = await tx.select().from(sessionExercises);
    const setRows = await tx.select().from(sets);
    const prRows = await tx.select().from(personalRecords);
    const programRows = await tx.select().from(programs);
    const programRoutineRows = await tx.select().from(programRoutines);
    const measurementRows = await tx.select().from(bodyMeasurements);
    const gymRows = await tx
      .select({ id: gyms.id, name: gyms.name, deletedAt: gyms.deletedAt })
      .from(gyms);
    const exerciseIds = [...new Set(sessionExerciseRows.map((row) => row.exerciseId))];
    const exerciseRows =
      exerciseIds.length === 0
        ? []
        : await tx.select().from(exercises).where(inArray(exercises.id, exerciseIds));

    const resolvedSettings = {
      units: settings?.units ?? "lb",
      weekStart: settings?.weekStart ?? 0,
      bodyweight: settings?.bodyweight ?? null,
      sex: settings?.sex ?? null,
      birthdate: settings?.birthdate ?? null,
    } as const;
    const { achievements, streak } = buildAchievementData(
      {
        sessions: sessionRows,
        sessionExercises: sessionExerciseRows,
        exercises: exerciseRows,
        sets: setRows,
        personalRecords: prRows,
        programs: programRows,
        programRoutines: programRoutineRows,
        bodyMeasurements: measurementRows,
      },
      resolvedSettings,
      new Date(),
    );
    return {
      units: resolvedSettings.units,
      weekStart: resolvedSettings.weekStart,
      weeklyTarget: streak.weeklyTarget,
      workouts: buildPortalWorkoutRows(
        sessionRows,
        sessionExerciseRows,
        exerciseRows,
        setRows,
        prRows,
        gymRows,
      ),
      achievements: serializeAchievements(achievements),
    };
  });
}

/**
 * The Cardio section (issue #470): every cardio set in a live workout.
 * The other sections leave cardio out (`isStrengthExercise`), so this is
 * where it shows up on desktop.
 */
export async function loadCardioData(): Promise<PortalCardioData> {
  return withUserDb(async (tx, userId) => {
    const [settings] = await tx
      .select({ units: users.units })
      .from(users)
      .where(eq(users.id, userId));
    const sessionRows = await tx
      .select({ id: sessions.id, deletedAt: sessions.deletedAt })
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
        completedAt: sets.completedAt,
        distance: sets.distance,
        durationSeconds: sets.durationSeconds,
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
    return buildPortalCardioData(
      sessionRows,
      sessionExerciseRows,
      exerciseRows,
      setRows,
      settings?.units ?? "lb",
    );
  });
}

/**
 * The PRP section (issue #470): the rows the phone's /progression screen
 * derives its calls and recaps from, plus the settings they read. Only the
 * settings the phone caches cross to the browser.
 */
export async function loadProgressionData(): Promise<PortalProgressionData> {
  return withUserDb(async (tx, userId) => {
    const settings = await readSettingsRow(tx, userId);
    const blockRows = await tx.select().from(dprBlocks);
    const liftRows = await tx.select().from(dprBlockLifts);
    const sessionRows = await tx.select().from(sessions);
    const sessionExerciseRows = await tx.select().from(sessionExercises);
    const setRows = await tx.select().from(sets);
    const routineRows = await tx.select().from(routines);
    const routineExerciseRows = await tx.select().from(routineExercises);
    const exerciseIds = [
      ...new Set([
        ...sessionExerciseRows.map((row) => row.exerciseId),
        ...liftRows.map((row) => row.exerciseId),
      ]),
    ];
    const exerciseRows =
      exerciseIds.length === 0
        ? []
        : await tx.select().from(exercises).where(inArray(exercises.id, exerciseIds));
    return {
      settings,
      blocks: blockRows,
      lifts: liftRows,
      exercises: exerciseRows,
      sessions: sessionRows,
      sessionExercises: sessionExerciseRows,
      sets: setRows,
      routines: routineRows,
      routineExercises: routineExerciseRows,
    };
  });
}

/**
 * The Routines section (issue #470): routines with their exercises and
 * targets, programs with their schedules, and scheduled workouts.
 */
export async function loadPlansData(): Promise<PortalPlansData> {
  return withUserDb(async (tx, userId) => {
    const [settings] = await tx
      .select({ units: users.units, weekStart: users.weekStart })
      .from(users)
      .where(eq(users.id, userId));
    const routineRows = await tx.select().from(routines);
    const routineExerciseRows = await tx.select().from(routineExercises);
    const programRows = await tx.select().from(programs);
    const programRoutineRows = await tx.select().from(programRoutines);
    const scheduledRows = await tx
      .select({
        id: scheduledWorkouts.id,
        routineId: scheduledWorkouts.routineId,
        scheduledFor: scheduledWorkouts.scheduledFor,
        notes: scheduledWorkouts.notes,
        deletedAt: scheduledWorkouts.deletedAt,
      })
      .from(scheduledWorkouts);
    const sessionRows = await tx
      .select({
        routineId: sessions.routineId,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
        deletedAt: sessions.deletedAt,
      })
      .from(sessions);
    const exerciseIds = [...new Set(routineExerciseRows.map((row) => row.exerciseId))];
    const exerciseRows =
      exerciseIds.length === 0
        ? []
        : await tx.select().from(exercises).where(inArray(exercises.id, exerciseIds));
    return buildPortalPlansData({
      units: settings?.units ?? "lb",
      weekStart: settings?.weekStart ?? 0,
      routines: routineRows,
      routineExercises: routineExerciseRows,
      exercises: exerciseRows,
      programs: programRows,
      programRoutines: programRoutineRows,
      sessions: sessionRows,
      scheduled: scheduledRows,
    });
  });
}

/** How much the Export section's files will hold (issue #470). */
export async function loadExportSummary(): Promise<{ workouts: number; weighIns: number }> {
  return withUserDb(async (tx) => {
    const sessionRows = await tx
      .select({ endedAt: sessions.endedAt, deletedAt: sessions.deletedAt })
      .from(sessions);
    const measurementRows = await tx
      .select({ kind: bodyMeasurements.kind, deletedAt: bodyMeasurements.deletedAt })
      .from(bodyMeasurements);
    return {
      workouts: sessionRows.filter((row) => row.endedAt && !row.deletedAt).length,
      weighIns: measurementRows.filter((row) => row.kind === "bodyweight" && !row.deletedAt).length,
    };
  });
}
