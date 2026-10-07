import { mutate } from "@/lib/db/mutate";
import {
  type JimDatabase,
  type ProgramRoutineRow,
  type ProgramRow,
  type RoutineExerciseRow,
  type RoutineRow,
  db,
} from "@/lib/db/schema";
import { startDprForProgram } from "@/lib/dpr/start-for-program";
import { setActiveProgram } from "@/lib/programs/set-active";
import { addWarmupTemplate } from "@/lib/routines/warmup-templates";
import { getCachedSettings, patchSettings } from "@/lib/settings";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type ExploreProgramTemplate,
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
      progressionRule: null,
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

  const scheduled: { routineId: string; weekday: number | null }[] = [];
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
    durationWeeks: null,
    activatedAt: null,
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

export interface AddExploreProgramResult {
  programId: string;
  missingSlugs: string[];
  /** Set when DPR was asked for but couldn't be (fully) started. */
  dprError: string | null;
}

/**
 * Adds an Explore program (issue #243) and, as the user chose on its card,
 * makes it the active program and starts Dynamic Progression on the focus
 * lifts the program's own progression rule calls for — at the program's
 * preset, and at the user's DPR experience if they've set one, else the
 * program's level.
 */
export async function addExploreProgram(
  userId: string,
  template: ExploreProgramTemplate,
  options: { activate: boolean; startDpr: boolean },
  database: JimDatabase = db,
  settingsPatcher: typeof patchSettings = patchSettings,
): Promise<AddExploreProgramResult> {
  const { programId, missingSlugs } = await addProgramTemplate(userId, template, database);
  if (options.activate) await setActiveProgram(programId, database);

  let dprError: string | null = null;
  const dpr = template.info.dpr;
  if (options.startDpr && dpr) {
    const settings = await getCachedSettings(database);
    dprError = await startDprForProgram(
      userId,
      programId,
      {
        focusSlugs: dpr.focusSlugs,
        weeks: dpr.weeks,
        preset: dpr.preset,
        experience: settings.dprExperience ?? template.info.level,
      },
      database,
      settingsPatcher,
    );
  }
  return { programId, missingSlugs, dprError };
}
