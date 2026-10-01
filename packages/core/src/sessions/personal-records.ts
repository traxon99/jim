import { estimateOneRepMax } from "../one-rep-max";

/** Mirrors `pr_kind` in packages/db's schema. */
export type PrKind = "1rm" | "weight" | "volume" | "reps_at_weight";

/**
 * Whether a PR kind is shown as a PR outside the PR page: the 🎉 on a set
 * mid-workout, PR chips and PR counts on summaries and history. Only the
 * estimated 1RM is (issue #389). The other kinds are still detected and
 * recorded, and the PR page lists them all.
 */
export function isVisiblePrKind(kind: PrKind): boolean {
  return kind === "1rm";
}

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

/**
 * Whether an exercise's tracking type earns "most reps at a weight" PRs.
 * Only bodyweight movements do: for anything loaded, reps top out well
 * before the count means much, so a new rep best at some weight is noise
 * next to 1RM, weight and volume (issue #354).
 */
export function tracksRepsAtWeight(trackingType: string | null | undefined): boolean {
  return trackingType === "bodyweight" || trackingType === "weighted_bodyweight";
}

export interface DetectOptions {
  /** Also consider `reps_at_weight` PRs — see `tracksRepsAtWeight`. */
  repsAtWeight: boolean;
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
 * `reps_at_weight` is only considered when `options.repsAtWeight` is set.
 */
export function detectPersonalRecords(
  set: WeightRepsSet,
  prior: PriorBests,
  options: DetectOptions,
): PrCandidate[] {
  const { weight, reps: setReps } = set;
  if (weight == null || setReps == null || weight <= 0 || setReps <= 0) return [];

  const candidates: PrCandidate[] = [];

  const oneRepMax = estimateOneRepMax(weight, setReps);
  if (oneRepMax > prior.oneRepMax) candidates.push({ kind: "1rm", value: oneRepMax });

  if (weight > prior.weight) candidates.push({ kind: "weight", value: weight });

  const volume = weight * setReps;
  if (volume > prior.volume) candidates.push({ kind: "volume", value: volume });

  if (!options.repsAtWeight) return candidates;

  // A reps PR at this weight only counts if no earlier set was at least as
  // heavy for at least as many reps (issue #352) — otherwise any lighter
  // weight never used before, like 150×8 after 160×8, reads as a PR.
  const outdone = Object.entries(prior.repsAtWeight).some(
    ([key, reps]) => Number(key) >= weight && reps >= setReps,
  );
  if (!outdone) candidates.push({ kind: "reps_at_weight", value: setReps });

  return candidates;
}
