import { mutate } from "@/lib/db/mutate";
import {
  type ExerciseRow,
  type JimDatabase,
  type ProgramRoutineRow,
  type ProgramRow,
  type RoutineExerciseRow,
  type RoutineRow,
  db,
} from "@/lib/db/schema";
import { getCachedSettings } from "@/lib/settings";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type ShareSnapshot,
  type ShareSource,
  buildProgramShare,
  buildRoutineShare,
  convertShareWeight,
  matchShareExercises,
  uuidv7,
} from "@jim/core";

// The phone's half of share links (issue #254): snapshots are built from
// IndexedDB, and adding one writes ordinary user-owned rows through mutate(),
// so they sync like anything the user made themselves.

async function shareSource(database: JimDatabase): Promise<ShareSource> {
  const [settings, routines, routineExercises, exercises] = await Promise.all([
    getCachedSettings(database),
    database.routines.toArray(),
    database.routineExercises.toArray(),
    database.exercises.toArray(),
  ]);
  return { units: settings.units, routines, routineExercises, exercises };
}

/** A snapshot of one routine (and its linked warm-up), or null when it's gone. */
export async function buildRoutineSnapshot(
  routineId: string,
  database: JimDatabase = db,
): Promise<ShareSnapshot | null> {
  return buildRoutineShare(routineId, await shareSource(database));
}

/** A snapshot of a program and every routine on it, or null when it's gone. */
export async function buildProgramSnapshot(
  programId: string,
  database: JimDatabase = db,
): Promise<ShareSnapshot | null> {
  const program = await database.programs.get(programId);
  if (!program || program.deletedAt) return null;
  const entries = await database.programRoutines.where("programId").equals(programId).toArray();
  return buildProgramShare(program, entries, await shareSource(database));
}

export type AddedShare =
  | { kind: "routine"; routineId: string }
  | { kind: "program"; programId: string };

/**
 * Copies a shared snapshot into the user's own rows: exercises matched to
 * their catalog (or copied in as custom ones), every routine with its
 * targets and order, warm-up links, and for a program its schedule. The
 * routines of a shared program are filed under a folder named after it, as
 * an Explore program's are. A shared program isn't made active.
 */
export async function addSharedSnapshot(
  userId: string,
  snapshot: ShareSnapshot,
  database: JimDatabase = db,
): Promise<AddedShare> {
  const [settings, existingExercises, existingRoutineCount, existingProgramCount, deviceId] =
    await Promise.all([
      getCachedSettings(database),
      database.exercises.toArray(),
      database.routines.count(),
      database.programs.count(),
      getDeviceId(database),
    ]);
  const now = new Date();
  const stamp = { updatedAt: now, deviceId, serverSeq: 0 };

  const matches = matchShareExercises(snapshot, existingExercises);
  const exerciseIds: string[] = [];
  for (const [index, shared] of snapshot.exercises.entries()) {
    const matched = matches[index];
    if (matched) {
      exerciseIds.push(matched);
      continue;
    }
    const row: ExerciseRow = {
      id: uuidv7(),
      ownerId: userId,
      slug: shared.slug,
      name: shared.name,
      aliases: [],
      primaryMuscles: shared.primaryMuscles,
      secondaryMuscles: shared.secondaryMuscles,
      equipment: shared.equipment,
      mechanic: shared.mechanic,
      force: shared.force,
      level: shared.level,
      trackingType: shared.trackingType,
      category: shared.category,
      instructions: shared.instructions,
      imageUrls: [],
      videoUrl: null,
      isArchived: false,
      createdAt: now,
      ...stamp,
    };
    await mutate("exercises", row, database);
    exerciseIds.push(row.id);
  }

  const folder = snapshot.program?.name ?? null;
  const routineIds = snapshot.routines.map(() => uuidv7());
  for (const [index, shared] of snapshot.routines.entries()) {
    const routineId = routineIds[index] as string;
    const routine: RoutineRow = {
      id: routineId,
      userId,
      name: shared.name,
      notes: shared.notes,
      position: existingRoutineCount + index,
      folder,
      kind: shared.kind,
      warmupRoutineId:
        shared.warmupRoutine === null ? null : (routineIds[shared.warmupRoutine] ?? null),
      warmupMinutes: shared.warmupMinutes,
      iconShape: shared.iconShape,
      iconColor: shared.iconColor,
      createdAt: now,
      deletedAt: null,
      ...stamp,
    };
    await mutate("routines", routine, database);

    for (const [position, item] of shared.items.entries()) {
      const exerciseId = exerciseIds[item.exercise];
      if (!exerciseId) continue;
      const weight = convertShareWeight(item.targetWeight, snapshot.units, settings.units);
      const row: RoutineExerciseRow = {
        id: uuidv7(),
        userId,
        routineId,
        exerciseId,
        position,
        supersetGroup: item.supersetGroup,
        targetSets: item.targetSets,
        targetRepsLow: item.targetRepsLow,
        targetRepsHigh: item.targetRepsHigh,
        targetRestSeconds: item.targetRestSeconds,
        targetDurationSeconds: item.targetDurationSeconds,
        targetWeight: weight === null ? null : String(weight),
        notes: item.notes,
        deletedAt: null,
        ...stamp,
      };
      await mutate("routineExercises", row, database);
    }
  }

  if (!snapshot.program) {
    return { kind: "routine", routineId: routineIds[0] as string };
  }

  const program: ProgramRow = {
    id: uuidv7(),
    userId,
    name: snapshot.program.name,
    mode: snapshot.program.mode,
    isActive: false,
    notes: snapshot.program.notes,
    position: existingProgramCount,
    durationWeeks: snapshot.program.durationWeeks,
    activatedAt: null,
    createdAt: now,
    deletedAt: null,
    ...stamp,
  };
  await mutate("programs", program, database);
  for (const [position, entry] of snapshot.program.entries.entries()) {
    const row: ProgramRoutineRow = {
      id: uuidv7(),
      userId,
      programId: program.id,
      routineId: entry.routine === null ? null : (routineIds[entry.routine] ?? null),
      position,
      weekday: entry.weekday,
      deletedAt: null,
      ...stamp,
    };
    await mutate("programRoutines", row, database);
  }
  return { kind: "program", programId: program.id };
}
