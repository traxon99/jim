import { type JimDatabase, db } from "@/lib/db/schema";
import { currentBlock, planBlock, startDprBlock } from "@/lib/dpr/block";
import { defaultRepRange, loadDprSnapshot } from "@/lib/dpr/data";
import { getCachedSettings, patchSettings } from "@/lib/settings";
import type { DprBlockWeeks, DprPresetName, ExperienceLevel } from "@jim/core";

export interface StartDprForProgramOptions {
  /** Catalog slugs of the lifts to progress; ones not on this device are skipped. */
  focusSlugs: readonly string[];
  experience: ExperienceLevel;
  weeks: DprBlockWeeks;
  /** Also sets the user's DPR preset. Omitted keeps the one in Settings. */
  preset?: DprPresetName;
}

/**
 * Starts a Dynamic Progression block on a program's focus lifts, tied to
 * that program, and turns DPR on. Shared by the program generator (issue
 * #251) and Explore's program templates (issue #243). Returns a message
 * for the user when it couldn't (a block is already running) or only half
 * could (the settings patch needs the network), else null.
 */
export async function startDprForProgram(
  userId: string,
  programId: string,
  options: StartDprForProgramOptions,
  database: JimDatabase = db,
  settingsPatcher: typeof patchSettings = patchSettings,
): Promise<string | null> {
  const blocks = await database.dprBlocks.toArray();
  if (currentBlock(blocks)) {
    return "You already have a PRP block running — change its lifts on the Progression tab.";
  }

  const globalExercises = (await database.exercises.toArray()).filter(
    (exercise) => exercise.ownerId == null,
  );
  const idBySlug = new Map(globalExercises.map((exercise) => [exercise.slug, exercise.id]));
  const exerciseIds = options.focusSlugs.flatMap((slug) => {
    const id = idBySlug.get(slug);
    return id ? [id] : [];
  });
  if (exerciseIds.length === 0) return null;

  const settings = await getCachedSettings(database);
  const preset = options.preset ?? settings.dprAggressiveness;
  const snapshot = await loadDprSnapshot(database, defaultRepRange(settings));
  const plan = planBlock(snapshot, {
    exerciseIds,
    weeks: options.weeks,
    preset,
    experience: options.experience,
    now: new Date(),
  });
  await startDprBlock(userId, plan, { programId }, database);

  const result = await settingsPatcher(
    {
      dprEnabled: true,
      dprExperience: options.experience,
      ...(options.preset ? { dprAggressiveness: options.preset } : {}),
    },
    database,
  );
  return result.ok ? null : `Block saved, but turning PRP on failed: ${result.error}`;
}
