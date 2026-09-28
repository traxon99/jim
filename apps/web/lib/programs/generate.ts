import { type JimDatabase, db } from "@/lib/db/schema";
import { currentBlock, planBlock, startDprBlock } from "@/lib/dpr/block";
import { defaultRepRange, loadDprSnapshot } from "@/lib/dpr/data";
import { addProgramTemplate } from "@/lib/explore/add-template";
import { setActiveProgram } from "@/lib/programs/set-active";
import { getCachedSettings, patchSettings } from "@/lib/settings";
import {
  type ExerciseUsage,
  type GeneratedProgram,
  type ProgramQuestionnaire,
  buildExerciseUsage,
  generateProgram,
} from "@jim/core";

/**
 * Generates a program from the questionnaire (issue #251) against this
 * device's catalog. Reads only IndexedDB, so it works offline. Only global
 * exercises are candidates — saving resolves slugs against those, same as
 * an Explore template.
 */
export async function generateProgramFromDb(
  answers: ProgramQuestionnaire,
  database: JimDatabase = db,
): Promise<GeneratedProgram> {
  const [exercises, sessions, sessionExercises] = await Promise.all([
    database.exercises.toArray(),
    database.sessions.toArray(),
    database.sessionExercises.toArray(),
  ]);

  const liveSessions = new Map(
    sessions.filter((session) => !session.deletedAt).map((session) => [session.id, session]),
  );
  const usage: Map<string, ExerciseUsage> = buildExerciseUsage(
    sessionExercises.flatMap((se) => {
      const session = liveSessions.get(se.sessionId);
      if (se.deletedAt || !session) return [];
      return [{ exerciseId: se.exerciseId, sessionId: se.sessionId, startedAt: session.startedAt }];
    }),
  );

  return generateProgram({
    ...answers,
    exercises: exercises.filter((exercise) => exercise.ownerId == null),
    usage,
  });
}

export interface SaveGeneratedProgramResult {
  programId: string;
  missingSlugs: string[];
  /** Set when DPR focus lifts were asked for but the block couldn't be started. */
  dprError: string | null;
}

/**
 * Saves a generated program through the Explore template path — so it's an
 * ordinary program with routines filed under its name — makes it the active
 * program, and, when focus lifts were picked and no DPR block is running,
 * starts a Dynamic Progression block on them tied to this program.
 */
export async function saveGeneratedProgram(
  userId: string,
  generated: GeneratedProgram,
  options: { dprFocusSlugs: readonly string[]; answers: ProgramQuestionnaire },
  database: JimDatabase = db,
  settingsPatcher: typeof patchSettings = patchSettings,
): Promise<SaveGeneratedProgramResult> {
  const { programId, missingSlugs } = await addProgramTemplate(
    userId,
    generated.template,
    database,
  );
  await setActiveProgram(programId, database);

  let dprError: string | null = null;
  if (options.dprFocusSlugs.length > 0) {
    dprError = await startDprForFocus(
      userId,
      programId,
      options.dprFocusSlugs,
      options.answers,
      database,
      settingsPatcher,
    );
  }

  return { programId, missingSlugs, dprError };
}

async function startDprForFocus(
  userId: string,
  programId: string,
  focusSlugs: readonly string[],
  answers: ProgramQuestionnaire,
  database: JimDatabase,
  settingsPatcher: typeof patchSettings,
): Promise<string | null> {
  const blocks = await database.dprBlocks.toArray();
  if (currentBlock(blocks)) {
    return "You already have a Dynamic Progression block running — change its lifts on the Progression tab.";
  }

  const globalExercises = (await database.exercises.toArray()).filter(
    (exercise) => exercise.ownerId == null,
  );
  const idBySlug = new Map(globalExercises.map((exercise) => [exercise.slug, exercise.id]));
  const exerciseIds = focusSlugs.flatMap((slug) => {
    const id = idBySlug.get(slug);
    return id ? [id] : [];
  });
  if (exerciseIds.length === 0) return null;

  const settings = await getCachedSettings(database);
  const snapshot = await loadDprSnapshot(database, defaultRepRange(settings));
  const plan = planBlock(snapshot, {
    exerciseIds,
    weeks: 8,
    preset: settings.dprAggressiveness,
    experience: answers.experience,
    now: new Date(),
  });
  await startDprBlock(userId, plan, { programId }, database);

  const result = await settingsPatcher(
    { dprEnabled: true, dprExperience: answers.experience },
    database,
  );
  return result.ok
    ? null
    : `Block saved, but turning Dynamic Progression on failed: ${result.error}`;
}
