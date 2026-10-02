import { type JimDatabase, db } from "@/lib/db/schema";
import { startDprForProgram } from "@/lib/dpr/start-for-program";
import { addProgramTemplate } from "@/lib/explore/add-template";
import { setActiveProgram } from "@/lib/programs/set-active";
import { patchSettings } from "@/lib/settings";
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
    dprError = await startDprForProgram(
      userId,
      programId,
      { focusSlugs: options.dprFocusSlugs, experience: options.answers.experience, weeks: 8 },
      database,
      settingsPatcher,
    );
  }

  return { programId, missingSlugs, dprError };
}
