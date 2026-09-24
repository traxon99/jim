import { mutate } from "@/lib/db/mutate";
import {
  type JimDatabase,
  type ProgramRoutineRow,
  type ProgramRow,
  type RoutineExerciseRow,
  type RoutineRow,
  db,
} from "@/lib/db/schema";
import { addWarmupTemplate } from "@/lib/routines/warmup-templates";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type ProgramTemplate,
  type RoutineTemplate,
  instantiateRoutineTemplate,
  pickDefaultRoutineIcon,
  uuidv7,
} from "@jim/core";

/**
 * Adds an Explore routine template (issue #141) as the user's own strength
 * routine — plus its warm-up, instantiated as a separate warm-up routine and
 * linked via warmupRoutineId. Same slug resolution as addWarmupTemplate: an
 * exercise that hasn't synced to this device yet is skipped and reported.
 */
export async function addRoutineTemplate(
  userId: string,
  template: RoutineTemplate,
  options: { folder?: string | null } = {},
  database: JimDatabase = db,
): Promise<{ routineId: string; missingSlugs: string[] }> {
  const missingSlugs: string[] = [];
  let warmupRoutineId: string | null = null;
  if (template.warmup) {
    const warmup = await addWarmupTemplate(userId, template.warmup, database);
    warmupRoutineId = warmup.routineId;
    missingSlugs.push(...warmup.missingSlugs);
  }

  // Dexie can't index null, so the global rows (ownerId null) come from a scan.
  const globalExercises = (await database.exercises.toArray()).filter(
    (exercise) => exercise.ownerId == null,
  );
  const exerciseIdBySlug = new Map(globalExercises.map((exercise) => [exercise.slug, exercise.id]));
  const { routine, items, ...result } = instantiateRoutineTemplate(
    template,
    exerciseIdBySlug,
    uuidv7,
  );
  missingSlugs.push(...result.missingSlugs);

  const deviceId = await getDeviceId(database);
  const now = new Date();
  const existingRoutines = await database.routines.toArray();
  const icon = pickDefaultRoutineIcon(
    existingRoutines
      .filter((r) => !r.deletedAt)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => ({ iconShape: r.iconShape, iconColor: r.iconColor })),
  );

  const routineRow: RoutineRow = {
    ...routine,
    userId,
    position: existingRoutines.length,
    folder: options.folder ?? null,
    warmupRoutineId,
    warmupMinutes: null,
    iconShape: icon.iconShape,
    iconColor: icon.iconColor,
    createdAt: now,
    updatedAt: now,
    deviceId,
    deletedAt: null,
    serverSeq: 0,
  };
  await mutate("routines", routineRow, database);

  for (const item of items) {
    const row: RoutineExerciseRow = {
      ...item,
      userId,
      routineId: routine.id,
      targetRestSeconds: null,
      targetWeight: null,
      progressionIncrement: null,
      progressionStartedAt: null,
      updatedAt: now,
      deviceId,
      deletedAt: null,
      serverSeq: 0,
    };
    await mutate("routineExercises", row, database);
  }

  return { routineId: routine.id, missingSlugs };
}

/**
 * Adds an Explore program template: every routine it schedules (filed under
 * a folder named after the program), its extra routines and stretches, and
 * the program itself with each routine on its weekday. The program isn't
 * made active — that stays the user's call on the program page.
 */
export async function addProgramTemplate(
  userId: string,
  template: ProgramTemplate,
  database: JimDatabase = db,
): Promise<{ programId: string; missingSlugs: string[] }> {
  const missing = new Set<string>();
  const folder = template.name;

  const scheduled: { routineId: string; weekday: number }[] = [];
  for (const day of template.days) {
    const added = await addRoutineTemplate(userId, day.routine, { folder }, database);
    scheduled.push({ routineId: added.routineId, weekday: day.weekday });
    for (const slug of added.missingSlugs) missing.add(slug);
  }
  for (const routine of template.extraRoutines) {
    const added = await addRoutineTemplate(userId, routine, { folder }, database);
    for (const slug of added.missingSlugs) missing.add(slug);
  }
  for (const warmup of template.warmups) {
    const added = await addWarmupTemplate(userId, warmup, database);
    for (const slug of added.missingSlugs) missing.add(slug);
  }

  const deviceId = await getDeviceId(database);
  const now = new Date();
  const program: ProgramRow = {
    id: uuidv7(),
    userId,
    name: template.name,
    mode: template.mode,
    isActive: false,
    notes: template.notes,
    position: await database.programs.count(),
    createdAt: now,
    updatedAt: now,
    deviceId,
    deletedAt: null,
    serverSeq: 0,
  };
  await mutate("programs", program, database);

  for (const [position, entry] of scheduled.entries()) {
    const row: ProgramRoutineRow = {
      id: uuidv7(),
      userId,
      programId: program.id,
      routineId: entry.routineId,
      position,
      weekday: entry.weekday,
      updatedAt: now,
      deviceId,
      deletedAt: null,
      serverSeq: 0,
    };
    await mutate("programRoutines", row, database);
  }

  return { programId: program.id, missingSlugs: [...missing] };
}
