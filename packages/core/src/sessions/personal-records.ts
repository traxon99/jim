import { estimateOneRepMax } from "../one-rep-max";

/** Mirrors `pr_kind` in packages/db's schema. */
export type PrKind = "1rm" | "weight" | "volume" | "reps_at_weight";

export interface PrCandidate {
  kind: PrKind;
  value: number;
}

/**
 * The best-ever values a new set is compared against, computed straight
 * from set history rather than the `personal_records` cache — that table is
 * "a derived cache, recomputable from `sets` alone" (docs/ARCHITECTURE.md
 * §4), and detection needs to be correct even before the cache has ever
 * been written.
 */
export interface PriorBests {
  /** Best estimated one-rep max ever, for any weight/rep combination. */
  oneRepMax: number;
  /** Heaviest weight ever lifted, regardless of reps. */
  weight: number;
  /** Highest single-set volume (weight * reps) ever. */
  volume: number;
  /** Best reps ever done at an exact weight, keyed by `weight.toFixed(2)`. */
  repsAtWeight: Readonly<Record<string, number>>;
}

export const EMPTY_PRIOR_BESTS: PriorBests = {
  oneRepMax: 0,
  weight: 0,
  volume: 0,
  repsAtWeight: {},
};

export interface WeightRepsSet {
  weight: number | null;
  reps: number | null;
}

function weightKey(weight: number): string {
  return weight.toFixed(2);
}

/**
 * Folds a history of sets (already resolved to their current, non-deleted
 * version — see `resolveCurrentRows`) into the running bests used for PR
 * detection. Only weight+reps sets participate; a tracking type without
 * both (time, distance, bodyweight) never produces a PR here.
 */
export function computePriorBests(history: readonly WeightRepsSet[]): PriorBests {
  let oneRepMax = 0;
  let weight = 0;
  let volume = 0;
  const repsAtWeight: Record<string, number> = {};

  for (const set of history) {
    if (set.weight == null || set.reps == null || set.weight <= 0 || set.reps <= 0) continue;

    oneRepMax = Math.max(oneRepMax, estimateOneRepMax(set.weight, set.reps));
    weight = Math.max(weight, set.weight);
    volume = Math.max(volume, set.weight * set.reps);

    const key = weightKey(set.weight);
    repsAtWeight[key] = Math.max(repsAtWeight[key] ?? 0, set.reps);
  }

  return { oneRepMax, weight, volume, repsAtWeight };
}

/**
 * Which PR kinds a just-completed set achieves against `prior` — the bests
 * from every earlier set for this exercise, this session's included (a set
 * can beat a PR that an earlier set in the same workout just set).
 */
export function detectPersonalRecords(set: WeightRepsSet, prior: PriorBests): PrCandidate[] {
  if (set.weight == null || set.reps == null || set.weight <= 0 || set.reps <= 0) return [];

  const candidates: PrCandidate[] = [];

  const oneRepMax = estimateOneRepMax(set.weight, set.reps);
  if (oneRepMax > prior.oneRepMax) candidates.push({ kind: "1rm", value: oneRepMax });

  if (set.weight > prior.weight) candidates.push({ kind: "weight", value: set.weight });

  const volume = set.weight * set.reps;
  if (volume > prior.volume) candidates.push({ kind: "volume", value: volume });

  const bestRepsAtThisWeight = prior.repsAtWeight[weightKey(set.weight)] ?? 0;
  if (set.reps > bestRepsAtThisWeight) {
    candidates.push({ kind: "reps_at_weight", value: set.reps });
  }

  return candidates;
}
