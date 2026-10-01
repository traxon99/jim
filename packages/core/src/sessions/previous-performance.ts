export interface PreviousSet {
  setIndex: number;
  kind: string;
  weight: number | null;
  reps: number | null;
  completedAt: Date;
}

export interface PreviousSetsByKind {
  /** Last time's warm-up sets, in the order they were logged. */
  warmups: PreviousSet[];
  /** Last time's working (and failure) sets, in order — warm-ups excluded. */
  working: PreviousSet[];
}

/**
 * "Previous-session values shown inline on each row as the number to beat"
 * (STORIES.md S6) — splits one prior session's sets into its warm-ups and
 * the rest, each in set order, so a row being logged now can look up what
 * happened at the same position last time: working set 1 against last
 * time's working set 1, however many warm-ups either workout had in front.
 * Matching by raw position instead made a workout with warm-ups shift every
 * later "last time" back by as many sets, and a later workout plan the
 * warm-ups as extra working sets. The caller is responsible for picking
 * which session counts as "previous" (most recent session, before the
 * current one, that included this exercise) and for resolving supersede
 * chains and tombstones first.
 */
export function splitPreviousSets(sets: readonly PreviousSet[]): PreviousSetsByKind {
  const ordered = [...sets].sort((a, b) => a.setIndex - b.setIndex);
  return {
    warmups: ordered.filter((set) => set.kind === "warmup"),
    working: ordered.filter((set) => set.kind !== "warmup"),
  };
}

/**
 * Every not-yet-logged set in a workout starts with a real weight already
 * filled in, rather than an empty field the lifter has to retype (issue #63,
 * extended by issue #121 to every row, not just the first): last time's
 * weight at this same position, when there is one. With no prior set at all
 * — the exercise's very first time being logged — `fallbackWeight` (a
 * routine's progressive-overload target for the top set, when configured)
 * fills the same role for set index 0 only; later sets in a brand-new
 * exercise have nothing to fall back on and stay blank.
 */
export function prefillWeightForSet(
  index: number,
  previous: PreviousSet | undefined,
  fallbackWeight?: number | null,
): string {
  if (previous?.weight != null) return String(previous.weight);
  if (index === 0 && fallbackWeight != null) return String(fallbackWeight);
  return "";
}

/**
 * How many set rows an exercise plans, logged or not (issue #121: preload
 * every set instead of drafting one at a time). Warm-ups ride on top of the
 * working sets rather than eating into them: rows are added until
 * `workingSetCount` of them aren't warm-ups (at least one), and never fewer
 * than `minRows` — enough to cover the warm-ups planned in front and every
 * set already logged. `kindAt` is the kind of the row at an index: its
 * logged set's, else the kind picked for the row still to log. Once the plan
 * is logged there's no extra row; another set is the lifter's call.
 */
export function plannedSetRowCount(
  workingSetCount: number,
  minRows: number,
  kindAt: (index: number) => string,
): number {
  const target = Math.max(workingSetCount, 1);
  let rows = 0;
  let working = 0;
  while (rows < minRows || working < target) {
    if (kindAt(rows) !== "warmup") working += 1;
    rows += 1;
  }
  return rows;
}

/**
 * Each row's position among the rows of its own kind, in order: warm-ups
 * count 0, 1, 2… on their own, and so do the working sets — so a row can be
 * matched to last time's set of the same kind at the same position.
 */
export function setKindOrdinals(kinds: readonly string[]): number[] {
  let warmups = 0;
  let working = 0;
  return kinds.map((kind) => (kind === "warmup" ? warmups++ : working++));
}

/**
 * Groups sets by `sessionExerciseId` and, given the exercise's own history
 * ordered newest-first, picks the most recent group that isn't the session
 * currently in progress — the "previous session" for this exercise.
 */
export function findPreviousSessionExerciseId(
  sessionExercises: readonly { id: string; sessionId: string; startedAt: Date }[],
  currentSessionId: string,
): string | null {
  const candidates = sessionExercises
    .filter((se) => se.sessionId !== currentSessionId)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  return candidates[0]?.id ?? null;
}
