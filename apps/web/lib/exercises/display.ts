import { db } from "@/lib/db/schema";
import { type ExerciseCategory, isCardioExercise, isWarmupExercise } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";

/** The category tabs the Exercises list and the exercise picker both show (#548). */
export const EXERCISE_CATEGORY_TABS: readonly {
  value: ExerciseCategory | "all";
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "strength", label: "Strength" },
  { value: "warmup", label: "Warm-ups" },
  { value: "cardio", label: "Cardio" },
];

/**
 * The grey line under an exercise's name in a list: kind, equipment, the
 * machine's gym and primary muscles. The gym is what tells two identical
 * machines at different gyms apart (#450, #548).
 */
export function exerciseMetaLine(
  exercise: {
    category?: ExerciseCategory | null;
    equipment: string | null;
    gymId?: string | null;
    primaryMuscles: readonly string[];
  },
  gymNames: ReadonlyMap<string, string> | undefined,
): string {
  return [
    isWarmupExercise(exercise) ? "warm-up" : null,
    isCardioExercise(exercise) ? "cardio" : null,
    exercise.equipment,
    exercise.gymId ? gymNames?.get(exercise.gymId) : null,
    ...exercise.primaryMuscles,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Names of the user's gyms by id; deleted gyms are left out. */
export function useGymNames(): ReadonlyMap<string, string> | undefined {
  return useLiveQuery(
    async () =>
      new Map((await db.gyms.toArray()).filter((g) => !g.deletedAt).map((g) => [g.id, g.name])),
    [],
  );
}
