"use client";

import type { PortalTrainingData } from "@/lib/portal/analysis-data";
import type { AnalysisSet } from "@jim/core";
import { useMemo } from "react";

/**
 * A section's training data as the charts and workout card take it: sets
 * with real dates, and exercise names and workouts by id.
 */
export function usePortalTraining(data: PortalTrainingData) {
  const sets = useMemo<AnalysisSet[]>(
    () => data.sets.map((set) => ({ ...set, completedAt: new Date(set.completedAt) })),
    [data.sets],
  );
  const exerciseNames = useMemo(
    () => new Map(data.exercises.map((exercise) => [exercise.id, exercise.name])),
    [data.exercises],
  );
  const workouts = useMemo(
    () => new Map(data.workouts.map((workout) => [workout.id, workout])),
    [data.workouts],
  );
  return { sets, exerciseNames, workouts };
}

/** What a section shows before anything's been logged. */
export const NO_WORKOUTS_YET =
  "No workouts logged yet. Train with Jim on your phone and your numbers will show up here.";
