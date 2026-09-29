import { formatRestSeconds } from "@jim/core";

/** The targets a routine's read-only view summarizes (issue #326). */
export interface RoutineTargets {
  targetSets: number | null;
  targetRepsLow: number | null;
  targetRepsHigh: number | null;
  targetDurationSeconds: number | null;
  targetRestSeconds: number | null;
  /** Postgres numeric: a fixed-scale string ("185.00"). */
  targetWeight: string | null;
}

function repRange(low: number | null, high: number | null): string | null {
  if (low != null && high != null) return low === high ? String(low) : `${low}–${high}`;
  const only = low ?? high;
  return only == null ? null : String(only);
}

/**
 * One line per exercise for the routine preview (issue #326), e.g.
 * "3 × 5–7 · 185 lb · 2:00 rest". A timed warm-up shows its hold instead of
 * reps ("2 × 30s"). Returns null when nothing is set.
 */
export function routineItemSummary(
  item: RoutineTargets,
  units: "lb" | "kg",
  timed = false,
): string | null {
  const perSet = timed
    ? item.targetDurationSeconds != null
      ? formatRestSeconds(item.targetDurationSeconds)
      : null
    : repRange(item.targetRepsLow, item.targetRepsHigh);

  let volume: string | null = null;
  if (item.targetSets != null && perSet != null) volume = `${item.targetSets} × ${perSet}`;
  else if (item.targetSets != null)
    volume = `${item.targetSets} ${item.targetSets === 1 ? "set" : "sets"}`;
  else if (perSet != null) volume = timed ? perSet : `${perSet} reps`;

  const weight = item.targetWeight == null ? null : Number(item.targetWeight);
  const parts = [
    volume,
    weight != null && Number.isFinite(weight) && weight > 0 ? `${weight} ${units}` : null,
    item.targetRestSeconds != null && item.targetRestSeconds > 0
      ? `${formatRestSeconds(item.targetRestSeconds)} rest`
      : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}
