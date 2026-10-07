import { supersetLinks } from "../supersets/supersets";

/**
 * Saving a workout's changes back to its routine (issue #407). When a
 * lifter adds, removes, replaces or reorders exercises, regroups supersets
 * or changes a rest from the ⋯ menu mid-workout, the app offers to carry
 * those changes into the routine so the next workout starts from them.
 *
 * Only the main (non-warm-up) exercises are compared: a linked warm-up
 * routine's exercises live on that routine, and the routine's own warm-up
 * exercises are always pulled to the front of a session anyway. Set counts
 * aren't compared either: doing fewer sets than planned is a bad day, not
 * a new plan.
 */
export interface RoutineChangeRoutineItem {
  id: string;
  exerciseId: string;
  position: number;
  supersetGroup: number | null;
  targetRestSeconds: number | null;
}

export interface RoutineChangeSessionItem {
  exerciseId: string;
  supersetGroup: number | null;
  /** The workout's ⋯ menu rest override; null keeps the routine's. */
  restSeconds: number | null;
  /** Working sets logged, which becomes an added exercise's target. */
  workingSetCount: number;
}

export interface RoutineChanges {
  /** Exercise ids in the workout but not the routine, in workout order. */
  added: string[];
  /** Exercise ids in the routine but not the workout, in routine order. */
  removed: string[];
  /** The exercises both share are in a different order. */
  reordered: boolean;
  /** Which exercises are supersetted together changed. */
  supersetsChanged: boolean;
  /** Shared exercise ids whose rest was changed in the workout. */
  restChanged: string[];
}

export function hasRoutineChanges(changes: RoutineChanges): boolean {
  return (
    changes.added.length > 0 ||
    changes.removed.length > 0 ||
    changes.reordered ||
    changes.supersetsChanged ||
    changes.restChanged.length > 0
  );
}

/**
 * A routine's main exercises in order, one per exercise: a session is
 * started with one entry per exercise (planSessionExercises), so a
 * duplicate further down the routine never reaches a workout and isn't
 * something the workout could have changed.
 */
function routineMainItems<T extends RoutineChangeRoutineItem>(
  routineItems: readonly T[],
  isWarmupExerciseId: (exerciseId: string) => boolean,
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of [...routineItems].sort((a, b) => a.position - b.position)) {
    if (isWarmupExerciseId(item.exerciseId) || seen.has(item.exerciseId)) continue;
    seen.add(item.exerciseId);
    result.push(item);
  }
  return result;
}

/** Whether each exercise is supersetted with the one after it. */
function linksByExerciseId(items: readonly { exerciseId: string; supersetGroup: number | null }[]) {
  const links = supersetLinks(
    items.map((item) => ({ id: item.exerciseId, supersetGroup: item.supersetGroup })),
  );
  return new Map(items.map((item, i) => [item.exerciseId, links[i] ?? false]));
}

/**
 * What the workout changed relative to its routine. `sessionMain` is the
 * workout's main exercises in display order.
 */
export function diffSessionAgainstRoutine(
  routineItems: readonly RoutineChangeRoutineItem[],
  sessionMain: readonly RoutineChangeSessionItem[],
  isWarmupExerciseId: (exerciseId: string) => boolean,
): RoutineChanges {
  const routineMain = routineMainItems(routineItems, isWarmupExerciseId);
  const routineIds = new Set(routineMain.map((item) => item.exerciseId));
  const sessionIds = new Set(sessionMain.map((item) => item.exerciseId));

  const added = sessionMain
    .filter((item) => !routineIds.has(item.exerciseId))
    .map((item) => item.exerciseId);
  const removed = routineMain
    .filter((item) => !sessionIds.has(item.exerciseId))
    .map((item) => item.exerciseId);

  const sharedRoutine = routineMain.filter((item) => sessionIds.has(item.exerciseId));
  const sharedSession = sessionMain.filter((item) => routineIds.has(item.exerciseId));
  const reordered = sharedRoutine.some(
    (item, i) => item.exerciseId !== sharedSession[i]?.exerciseId,
  );

  // Superset membership is adjacency (supersets.ts), so compare each
  // exercise's link to whatever follows it, across the full lists.
  const routineLinks = linksByExerciseId(routineMain);
  const sessionLinks = linksByExerciseId(sessionMain);
  const supersetsChanged =
    sessionMain.some(
      (item) => sessionLinks.get(item.exerciseId) && !routineIds.has(item.exerciseId),
    ) ||
    sharedSession.some(
      (item) => sessionLinks.get(item.exerciseId) !== routineLinks.get(item.exerciseId),
    );

  const targetRestById = new Map(routineMain.map((item) => [item.exerciseId, item]));
  const restChanged = sharedSession
    .filter((item) => {
      const routineItem = targetRestById.get(item.exerciseId);
      return item.restSeconds != null && item.restSeconds !== routineItem?.targetRestSeconds;
    })
    .map((item) => item.exerciseId);

  return { added, removed, reordered, supersetsChanged, restChanged };
}

export interface RoutineUpdatePlan {
  /** Existing routine rows whose position, superset or rest changes. */
  updates: {
    id: string;
    position: number;
    supersetGroup: number | null;
    targetRestSeconds: number | null;
  }[];
  /** New routine rows for exercises added in the workout. */
  additions: {
    exerciseId: string;
    position: number;
    supersetGroup: number | null;
    targetRestSeconds: number | null;
    targetSets: number | null;
  }[];
  /** Routine row ids to remove: exercises dropped in the workout. */
  removals: string[];
}

/**
 * The routine rows to write so the routine matches the workout. The
 * routine's own warm-up exercises stay first, as a session shows them;
 * the main exercises follow in the workout's order with its supersets and
 * rest changes. Kept exercises keep their targets; an added one gets the
 * working sets logged today as its target.
 */
export function planRoutineUpdate(
  routineItems: readonly RoutineChangeRoutineItem[],
  sessionMain: readonly RoutineChangeSessionItem[],
  isWarmupExerciseId: (exerciseId: string) => boolean,
): RoutineUpdatePlan {
  const sorted = [...routineItems].sort((a, b) => a.position - b.position);
  const routineMain = routineMainItems(routineItems, isWarmupExerciseId);
  const routineByExerciseId = new Map(routineMain.map((item) => [item.exerciseId, item]));
  const sessionIds = new Set(sessionMain.map((item) => item.exerciseId));
  const mainRowIds = new Set(routineMain.map((item) => item.id));

  const updates: RoutineUpdatePlan["updates"] = [];
  const additions: RoutineUpdatePlan["additions"] = [];
  const removals = routineMain
    .filter((item) => !sessionIds.has(item.exerciseId))
    .map((item) => item.id);
  const removalIds = new Set(removals);

  // Group numbers come out of the workout, which may have used ones the
  // routine's warm-ups also use; offsetting keeps every run distinct.
  const warmupRows = sorted.filter((item) => isWarmupExerciseId(item.exerciseId));
  const groupOffset = Math.max(0, ...warmupRows.map((item) => item.supersetGroup ?? 0));

  let position = 0;
  const pushUpdate = (
    item: RoutineChangeRoutineItem,
    supersetGroup: number | null,
    targetRestSeconds: number | null,
  ) => {
    if (
      item.position !== position ||
      item.supersetGroup !== supersetGroup ||
      item.targetRestSeconds !== targetRestSeconds
    ) {
      updates.push({ id: item.id, position, supersetGroup, targetRestSeconds });
    }
    position++;
  };

  for (const item of warmupRows) pushUpdate(item, item.supersetGroup, item.targetRestSeconds);

  const sessionLinks = supersetLinks(
    sessionMain.map((item, i) => ({ id: String(i), supersetGroup: item.supersetGroup })),
  );
  let group: number | null = null;
  let nextGroup = groupOffset;
  sessionMain.forEach((item, i) => {
    const linkedToPrevious = i > 0 && sessionLinks[i - 1] === true;
    if (!linkedToPrevious) group = sessionLinks[i] ? ++nextGroup : null;
    const existing = routineByExerciseId.get(item.exerciseId);
    if (existing) {
      pushUpdate(existing, group, item.restSeconds ?? existing.targetRestSeconds);
    } else {
      additions.push({
        exerciseId: item.exerciseId,
        position: position++,
        supersetGroup: group,
        targetRestSeconds: item.restSeconds,
        targetSets: item.workingSetCount > 0 ? item.workingSetCount : null,
      });
    }
  });

  // Duplicate rows a session never showed go to the end, as they were.
  for (const item of sorted) {
    if (isWarmupExerciseId(item.exerciseId) || mainRowIds.has(item.id) || removalIds.has(item.id))
      continue;
    pushUpdate(item, null, item.targetRestSeconds);
  }

  return { updates, additions, removals };
}
