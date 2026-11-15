"use client";

import { db } from "@/lib/db/schema";
import { type ExercisePreference, buildExercisePreferenceMap } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";

/** Slug → Like/Dislike, live; undefined while loading. */
export function useExercisePreferences(): ReadonlyMap<string, ExercisePreference> | undefined {
  const rows = useLiveQuery(() => db.exercisePreferences.toArray(), []);
  return useMemo(() => (rows ? buildExercisePreferenceMap(rows) : undefined), [rows]);
}
