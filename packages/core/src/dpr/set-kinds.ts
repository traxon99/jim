import type { DprSet, DprSetKind } from "./decide";
import { FAILURE_RPE } from "./presets";

/**
 * A set taken to failure (issue #726): marked as a failure set, or logged at
 * RPE 10. Failure is information about where the lifter's limit sits, not a
 * miss: it's tracked like any working set and never counts toward a deload.
 */
export function isFailureSet(set: Pick<DprSet, "kind" | "rpe">): boolean {
  return set.kind === "failure" || (set.rpe !== null && set.rpe >= FAILURE_RPE);
}

/** Working and failure sets are what PRP judges and estimates from. */
export function countsForDpr(kind: DprSetKind | string): boolean {
  return kind === "working" || kind === "failure";
}

/** A failure set with no RPE logged was, by definition, RPE 10. */
export function dprSetRpe(set: Pick<DprSet, "kind" | "rpe">): number | null {
  return set.rpe ?? (set.kind === "failure" ? FAILURE_RPE : null);
}
