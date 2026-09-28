import type { RoutineExerciseRow } from "@/lib/db/schema";
import { type DprCallInfo, type DprContext, dprCallFor } from "@/lib/dpr/calls";
import type { SessionIntensity } from "@jim/core";

export interface PreWorkoutRow {
  id: string;
  exerciseId: string;
  name: string;
  /** "3 × 6–8", "3 sets", "8 reps" — null with no targets. */
  plan: string | null;
  /** DPR's call for a focused lift at the picked intensity, else null. */
  dpr: DprCallInfo | null;
}

/** "3 × 6–8" from a routine item's targets; null when it has none. */
export function formatPlan(
  item: Pick<RoutineExerciseRow, "targetSets" | "targetRepsLow" | "targetRepsHigh">,
): string | null {
  const { targetSets: sets, targetRepsLow: low, targetRepsHigh: high } = item;
  const reps =
    low != null && high != null && low !== high ? `${low}–${high}` : (low ?? high ?? null);
  if (sets != null && reps != null) return `${sets} × ${reps}`;
  if (sets != null) return `${sets} set${sets === 1 ? "" : "s"}`;
  if (reps != null) return `${reps} reps`;
  return null;
}

/**
 * The pre-workout sheet's exercise list (issue #235): a routine's live items
 * in order, each with its plan and, for DPR's focused lifts, the call for
 * the intensity picked so far.
 */
export function buildPreWorkoutRows(
  ctx: DprContext,
  items: readonly RoutineExerciseRow[],
  intensity: SessionIntensity,
): PreWorkoutRow[] {
  return items
    .filter((item) => !item.deletedAt)
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      id: item.id,
      exerciseId: item.exerciseId,
      name: ctx.exercises.get(item.exerciseId)?.name ?? "Exercise",
      plan: formatPlan(item),
      dpr: dprCallFor(ctx, item.exerciseId, item, intensity),
    }));
}
