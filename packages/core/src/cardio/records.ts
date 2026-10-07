import type { CardioSetValues } from "./format";

/**
 * Cardio's records (issue #423): longest distance, longest time and fastest
 * pace. Computed straight from set history on demand rather than stored in
 * `personal_records`, the same "derivable from sets alone" stance PR
 * detection takes (docs/ARCHITECTURE.md §4).
 */
export interface CardioBests {
  /** Longest single-set distance, or null if none was ever logged. */
  distance: number | null;
  /** Longest single-set time in seconds. */
  durationSeconds: number | null;
  /** Fastest pace, in seconds per distance unit, from sets with both. */
  paceSeconds: number | null;
}

export type CardioRecordKind = "distance" | "duration" | "pace";

export const EMPTY_CARDIO_BESTS: CardioBests = {
  distance: null,
  durationSeconds: null,
  paceSeconds: null,
};

function positive(value: number | string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Folds sets (already resolved to their current, non-deleted versions) into running bests. */
export function computeCardioBests(history: readonly CardioSetValues[]): CardioBests {
  let bests = EMPTY_CARDIO_BESTS;
  for (const set of history) bests = foldCardioSet(bests, set);
  return bests;
}

function foldCardioSet(bests: CardioBests, set: CardioSetValues): CardioBests {
  const distance = positive(set.distance);
  const duration = positive(set.durationSeconds);
  const pace = distance != null && duration != null ? duration / distance : null;
  return {
    distance:
      distance != null && (bests.distance == null || distance > bests.distance)
        ? distance
        : bests.distance,
    durationSeconds:
      duration != null && (bests.durationSeconds == null || duration > bests.durationSeconds)
        ? duration
        : bests.durationSeconds,
    paceSeconds:
      pace != null && (bests.paceSeconds == null || pace < bests.paceSeconds)
        ? pace
        : bests.paceSeconds,
  };
}

/**
 * Which records a set beats against `prior`. A first-ever value isn't a
 * record: there was nothing to beat, and every first cardio set would
 * otherwise celebrate itself.
 */
export function detectCardioRecords(set: CardioSetValues, prior: CardioBests): CardioRecordKind[] {
  const next = foldCardioSet(prior, set);
  const kinds: CardioRecordKind[] = [];
  if (prior.distance != null && next.distance !== prior.distance) kinds.push("distance");
  if (prior.durationSeconds != null && next.durationSeconds !== prior.durationSeconds) {
    kinds.push("duration");
  }
  if (prior.paceSeconds != null && next.paceSeconds !== prior.paceSeconds) kinds.push("pace");
  return kinds;
}
