"use client";

import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { type AchievementData, buildAchievementData } from "./achievement-data";

/** Live achievements and streak off IndexedDB; `undefined` while loading. */
export function useAchievements(): AchievementData | undefined {
  return useLiveQuery(async () => {
    const [
      sessions,
      sessionExercises,
      exercises,
      sets,
      personalRecords,
      programs,
      programRoutines,
      settings,
    ] = await Promise.all([
      db.sessions.toArray(),
      db.sessionExercises.toArray(),
      db.exercises.toArray(),
      db.sets.toArray(),
      db.personalRecords.toArray(),
      db.programs.toArray(),
      db.programRoutines.toArray(),
      db.settings.get("me"),
    ]);
    return buildAchievementData(
      { sessions, sessionExercises, exercises, sets, personalRecords, programs, programRoutines },
      settings ?? DEFAULT_SETTINGS,
      new Date(),
    );
  }, []);
}
