"use server";

import type { ExportTables } from "@/lib/data-transfer/export-build";
import { withUserDb } from "@/lib/db/user-scoped";
import { openPulledGymCards } from "@/lib/gym-cards/seal";
import { readSettingsRow } from "@/lib/portal/load-portal-data";
import {
  bodyMeasurements,
  dprBlockLifts,
  dprBlocks,
  exercisePreferences,
  exercises,
  gymCards,
  gyms,
  injuries,
  painCheckins,
  personalRecords,
  programRoutines,
  programs,
  progressPhotos,
  routineExercises,
  routines,
  sessionExercises,
  sessions,
  sets,
  sickDays,
} from "@jim/db";
import { eq, inArray, or } from "drizzle-orm";

/**
 * Every row the export files are built from (issue #470), read under the
 * signed-in user's RLS scope like the rest of the portal. A Server Function
 * rather than page props so the tables load only when a download is asked
 * for, with their Dates intact; the files are built in the browser so
 * their local times follow its time zone. `withUserDb` throws for a
 * signed-out caller.
 */
export async function loadExportTables(): Promise<ExportTables> {
  return withUserDb(async (tx, userId) => {
    const settings = await readSettingsRow(tx, userId);
    const sessionRows = await tx.select().from(sessions);
    const sessionExerciseRows = await tx.select().from(sessionExercises);
    const setRows = await tx.select().from(sets);
    const routineRows = await tx.select().from(routines);
    const routineExerciseRows = await tx.select().from(routineExercises);
    const programRows = await tx.select().from(programs);
    const programRoutineRows = await tx.select().from(programRoutines);
    const prRows = await tx.select().from(personalRecords);
    const measurementRows = await tx.select().from(bodyMeasurements);
    const blockRows = await tx.select().from(dprBlocks);
    const liftRows = await tx.select().from(dprBlockLifts);
    const gymRows = await tx.select().from(gyms);
    const injuryRows = await tx.select().from(injuries);
    const checkinRows = await tx.select().from(painCheckins);
    const sickDayRows = await tx.select().from(sickDays);
    const preferenceRows = await tx.select().from(exercisePreferences);
    const photoRows = await tx.select().from(progressPhotos);
    // Gym card codes are stored sealed (issue #878); the owner's export opens them.
    const gymCardRows = openPulledGymCards(await tx.select().from(gymCards));
    // The exercises the history names, plus every custom one the user owns.
    const exerciseIds = [
      ...new Set([
        ...sessionExerciseRows.map((row) => row.exerciseId),
        ...routineExerciseRows.map((row) => row.exerciseId),
      ]),
    ];
    const exerciseRows = await tx
      .select()
      .from(exercises)
      .where(
        exerciseIds.length === 0
          ? eq(exercises.ownerId, userId)
          : or(inArray(exercises.id, exerciseIds), eq(exercises.ownerId, userId)),
      );
    return {
      settings,
      sessions: sessionRows,
      sessionExercises: sessionExerciseRows,
      sets: setRows,
      exercises: exerciseRows,
      routines: routineRows,
      routineExercises: routineExerciseRows,
      programs: programRows,
      programRoutines: programRoutineRows,
      personalRecords: prRows,
      bodyMeasurements: measurementRows,
      dprBlocks: blockRows,
      dprBlockLifts: liftRows,
      gyms: gymRows,
      injuries: injuryRows,
      painCheckins: checkinRows,
      sickDays: sickDayRows,
      exercisePreferences: preferenceRows,
      progressPhotos: photoRows,
      gymCards: gymCardRows,
    };
  });
}
