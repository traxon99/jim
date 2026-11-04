import { db } from "@/lib/db/schema";
import { predictedOneRepMaxByExercise } from "@/lib/history/predicted-by-exercise";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { PROFILE_LIFT_HIGHLIGHTS, type ProfileLiftKey } from "@jim/core";

export interface ProfileLiftHighlight {
  key: ProfileLiftKey;
  label: string;
  e1rm: number;
  units: "lb" | "kg";
}

/** Best predicted 1RM for the five profile lifts from local history. */
export async function ownLiftHighlights(
  units: "lb" | "kg",
  now: Date = new Date(),
): Promise<ProfileLiftHighlight[]> {
  const [sessions, sessionExercises, sets, exercises] = await Promise.all([
    db.sessions.toArray(),
    db.sessionExercises.toArray(),
    db.sets.toArray(),
    db.exercises.toArray(),
  ]);
  const bySlug = new Map(exercises.map((exercise) => [exercise.slug, exercise.id]));
  const predicted = predictedOneRepMaxByExercise(sessions, sessionExercises, sets, now);
  const out: ProfileLiftHighlight[] = [];
  for (const lift of PROFILE_LIFT_HIGHLIGHTS) {
    const exerciseId = bySlug.get(lift.slug);
    if (!exerciseId) continue;
    const row = predicted.get(exerciseId);
    if (!row?.value) continue;
    out.push({
      key: lift.key,
      label: lift.label,
      e1rm: Math.round(row.value),
      units,
    });
  }
  return out;
}

export async function ownProfileUnits(): Promise<"lb" | "kg"> {
  const settings = (await db.settings.get("me")) ?? DEFAULT_SETTINGS;
  return settings.units;
}
