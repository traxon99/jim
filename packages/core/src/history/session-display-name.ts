export interface SessionDisplayNameSet {
  // Plain `string`, not `Muscle` — matches `MuscleVolumeSet` (volume-by-muscle.ts),
  // which callers here typically already have on hand.
  primaryMuscles: readonly string[];
}

/**
 * "Rework untitled workouts to have a more descriptive name, such as the
 * day of the week and main muscle hit that day" (feedback issue #36).
 * Derived at display time from the session's own sets rather than stored,
 * so every unnamed workout gets one — past sessions included — with no
 * schema or sync change.
 */
export function deriveUntitledSessionName(
  startedAt: Date,
  sets: readonly SessionDisplayNameSet[],
): string {
  const weekday = startedAt.toLocaleDateString("en-US", { weekday: "long" });

  const setCountByMuscle = new Map<string, number>();
  for (const set of sets) {
    for (const muscle of set.primaryMuscles) {
      setCountByMuscle.set(muscle, (setCountByMuscle.get(muscle) ?? 0) + 1);
    }
  }
  if (setCountByMuscle.size === 0) return weekday;

  const maxSetCount = Math.max(...setCountByMuscle.values());
  const topMuscles = [...setCountByMuscle.entries()]
    .filter(([, count]) => count === maxSetCount)
    .map(([muscle]) => muscle)
    .sort();

  // More than two muscles tied for "most sets" isn't a useful summary —
  // the weekday alone beats naming half the muscle list.
  if (topMuscles.length > 2) return weekday;

  return `${weekday} · ${topMuscles.map(titleCase).join(" & ")}`;
}

function titleCase(muscle: string): string {
  return muscle.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
